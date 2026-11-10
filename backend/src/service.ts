import { Injectable, OnModuleInit, OnModuleDestroy, BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { RDSClient, CreateDBInstanceCommand, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
type RecordData = { title: string; detail: string };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
@Injectable()
export class DataService implements OnModuleInit, OnModuleDestroy {
  private readonly config = { region: process.env.AWS_REGION || 'us-east-1', endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566', credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'local', secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'local' } };
  private readonly rds = new RDSClient(this.config);
  private readonly dynamo = new DynamoDBClient(this.config);
  private readonly docs = DynamoDBDocumentClient.from(this.dynamo);
  private pool?: Pool;
  private state: Record<string, string> = { sql: 'Iniciando', nosql: 'Iniciando' };
  onModuleInit() { void this.initialize(); }
  async onModuleDestroy() { await this.pool?.end(); this.rds.destroy(); this.dynamo.destroy(); }
  private async initialize() {
    // Cada almacén se prepara de forma independiente: uno puede funcionar aunque falle el otro.
    await Promise.all([this.prepareSql(), this.prepareNoSql()]);
  }
  private async retry(label: string, action: () => Promise<void>) {
    for (let n = 1; n <= 30; n++) {
      try { await action(); this.state[label] = 'Conectado'; return; }
      catch (e) { this.state[label] = `Esperando servicio (${n}/30)`; console.error(label, (e as Error).message); await sleep(5000); }
    }
    this.state[label] = 'No disponible; revisa los registros y reinicia backend';
  }
  private async prepareSql() {
    await this.retry('sql', async () => {
      let instance;
      try { instance = (await this.rds.send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: 'unidad3-postgres' }))).DBInstances?.[0]; }
      catch (e) {
        if ((e as Error).name !== 'DBInstanceNotFoundFault' && (e as Error).name !== 'DBInstanceNotFound') throw e;
        await this.rds.send(new CreateDBInstanceCommand({ DBInstanceIdentifier: 'unidad3-postgres', DBInstanceClass: 'db.t3.micro', Engine: 'postgres', MasterUsername: 'docente', MasterUserPassword: 'practica123', AllocatedStorage: 20, DBName: 'practica' }));
        throw new Error('Instancia RDS solicitada; esperando PostgreSQL');
      }
      if (!instance?.Endpoint?.Address || !instance.Endpoint.Port) throw new Error('RDS todavía no publica endpoint');
      const pool = new Pool({ host: instance.Endpoint.Address, port: instance.Endpoint.Port, user: 'docente', password: 'practica123', database: 'practica', connectionTimeoutMillis: 3000 });
      try { await pool.query('CREATE TABLE IF NOT EXISTS records (id UUID PRIMARY KEY, title VARCHAR(100) NOT NULL, detail VARCHAR(300) NOT NULL)'); }
      catch (e) { await pool.end(); throw e; }
      this.pool = pool;
    });
  }
  private async prepareNoSql() {
    await this.retry('nosql', async () => {
      try { await this.dynamo.send(new DescribeTableCommand({ TableName: 'unidad3-records' })); }
      catch (e) {
        if ((e as Error).name !== 'ResourceNotFoundException') throw e;
        await this.dynamo.send(new CreateTableCommand({ TableName: 'unidad3-records', AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }], KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }], BillingMode: 'PAY_PER_REQUEST' }));
      }
    });
  }
  status() { return this.state; }
  private check(store: string) {
    if (!['sql', 'nosql'].includes(store)) throw new BadRequestException('Almacén inválido');
    if (this.state[store] !== 'Conectado') throw new ServiceUnavailableException(this.state[store]);
  }
  async list(store: string) {
    this.check(store);
    if (store === 'sql') return (await this.pool!.query('SELECT id, title, detail FROM records ORDER BY title')).rows;
    // Scan es sencillo para mostrar los datos; en sistemas reales se diseñan consultas por clave y paginación.
    const items: Record<string, unknown>[] = []; let key: Record<string, any> | undefined;
    do { const page = await this.docs.send(new ScanCommand({ TableName: 'unidad3-records', ExclusiveStartKey: key })); items.push(...(page.Items || [])); key = page.LastEvaluatedKey; } while (key);
    return items;
  }
  async create(store: string, dto: RecordData) {
    this.check(store); const item = { id: randomUUID(), ...dto };
    if (store === 'sql') await this.pool!.query('INSERT INTO records (id, title, detail) VALUES ($1, $2, $3)', [item.id, item.title, item.detail]);
    else await this.docs.send(new PutCommand({ TableName: 'unidad3-records', Item: item }));
    return item;
  }
  async update(store: string, id: string, dto: RecordData) {
    this.check(store);
    if (store === 'sql') { const result = await this.pool!.query('UPDATE records SET title=$1, detail=$2 WHERE id::text=$3 RETURNING *', [dto.title, dto.detail, id]); if (!result.rowCount) throw new NotFoundException(); return result.rows[0]; }
    try { await this.docs.send(new UpdateCommand({ TableName: 'unidad3-records', Key: { id }, UpdateExpression: 'SET title = :title, detail = :detail', ConditionExpression: 'attribute_exists(id)', ExpressionAttributeValues: { ':title': dto.title, ':detail': dto.detail } })); }
    catch (e) { if ((e as Error).name === 'ConditionalCheckFailedException') throw new NotFoundException(); throw e; }
    return { id, ...dto };
  }
  async remove(store: string, id: string) {
    this.check(store);
    if (store === 'sql') { const result = await this.pool!.query('DELETE FROM records WHERE id::text=$1', [id]); if (!result.rowCount) throw new NotFoundException(); }
    else { try { await this.docs.send(new DeleteCommand({ TableName: 'unidad3-records', Key: { id }, ConditionExpression: 'attribute_exists(id)' })); } catch (e) { if ((e as Error).name === 'ConditionalCheckFailedException') throw new NotFoundException(); throw e; } }
    return { deleted: true };
  }
}
