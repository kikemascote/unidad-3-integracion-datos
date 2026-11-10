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
    // Cada almacÃ©n se prepara de forma independiente: uno puede funcionar aunque falle el otro.
    await Promise.all([this.prepareSql(), this.prepareNoSql()]);
    await this.seed();
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
      if (!instance?.Endpoint?.Address || !instance.Endpoint.Port) throw new Error('RDS todavÃ­a no publica endpoint');
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
  // Semillas con identificadores estables: no se sobrescriben las ediciones del alumno.
  private async seed() {
    const products = [
      ['Laptop Aula', {sku:'TEC-001',price:12500,stock:8}],
      ['Mouse inalámbrico', {sku:'TEC-002',price:350,stock:40}],
      ['Monitor 24 pulgadas', {sku:'TEC-003',price:3200,stock:12}],
      ['Teclado mecánico', {sku:'TEC-004',price:950,stock:20}],
      ['Cámara web', {sku:'TEC-005',price:780,stock:15}]
    ] as const;
    const reviews = [
      ['Ana · Laptop Aula', {product:'TEC-001',stars:5,comment:'Ideal para programar',verified:true}],
      ['Luis · Mouse inalámbrico', {product:'TEC-002',stars:4,comment:'Muy cómodo',batteryMonths:6}],
      ['Marta · Monitor', {product:'TEC-003',stars:5,comment:'Buen color',photo:'escritorio.jpg'}],
      ['José · Teclado', {product:'TEC-004',stars:3,comment:'Algo ruidoso',switchType:'blue'}],
      ['Sofía · Cámara web', {product:'TEC-005',stars:4,comment:'Funciona en clase',platform:'Linux',tags:['clases','video']}]
    ] as const;
    for (const store of ['sql','nosql']) {
      if (this.state[store] !== 'Conectado') continue;
      const values = store === 'sql' ? products : reviews;
      for (let i=0;i<values.length;i++) {
        const id = `00000000-0000-4000-8000-00000000000${i+1}`;
        const item = {id,title:values[i][0],detail:JSON.stringify(values[i][1])};
        if (store === 'sql') await this.pool!.query('INSERT INTO records (id,title,detail) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING',[id,item.title,item.detail]);
        else try { await this.docs.send(new PutCommand({TableName:'unidad3-records',Item:{...item,attributes:values[i][1]},ConditionExpression:'attribute_not_exists(id)'})); } catch(e) { if ((e as Error).name !== 'ConditionalCheckFailedException') throw e; }
      }
    }
  }
  private attributes(store: string, dto: RecordData) {
    let data: any;
    try { data=JSON.parse(dto.detail); } catch { throw new BadRequestException('El detalle debe ser un objeto JSON válido'); }
    if (!data || Array.isArray(data) || typeof data !== 'object') throw new BadRequestException('Se requiere un objeto JSON');
    if (store === 'sql' && (Object.keys(data).sort().join(',') !== 'price,sku,stock' || typeof data.sku !== 'string' || !data.sku || !Number.isFinite(data.price) || data.price < 0 || !Number.isInteger(data.stock) || data.stock < 0)) throw new BadRequestException('Producto: sku de texto, price numérico positivo y stock entero no negativo');
    return data;
  }
  status() { return this.state; }
  private check(store: string) {
    if (!['sql', 'nosql'].includes(store)) throw new BadRequestException('AlmacÃ©n invÃ¡lido');
    if (this.state[store] !== 'Conectado') throw new ServiceUnavailableException(this.state[store]);
  }
  async list(store: string) {
    this.check(store);
    if (store === 'sql') return (await this.pool!.query('SELECT id, title, detail FROM records ORDER BY title')).rows;
    // Scan es sencillo para mostrar los datos; en sistemas reales se diseÃ±an consultas por clave y paginaciÃ³n.
    const items: Record<string, unknown>[] = []; let key: Record<string, any> | undefined;
    do { const page = await this.docs.send(new ScanCommand({ TableName: 'unidad3-records', ExclusiveStartKey: key })); items.push(...(page.Items || [])); key = page.LastEvaluatedKey; } while (key);
    return items;
  }
  async create(store: string, dto: RecordData) {
    this.check(store); const attributes=this.attributes(store,dto); const item = { id: randomUUID(), ...dto };
    if (store === 'sql') await this.pool!.query('INSERT INTO records (id, title, detail) VALUES ($1, $2, $3)', [item.id, item.title, item.detail]);
    else await this.docs.send(new PutCommand({ TableName: 'unidad3-records', Item: {...item, attributes} }));
    return item;
  }
  async update(store: string, id: string, dto: RecordData) {
    this.check(store); const attributes=this.attributes(store,dto);
    if (store === 'sql') { const result = await this.pool!.query('UPDATE records SET title=$1, detail=$2 WHERE id::text=$3 RETURNING *', [dto.title, dto.detail, id]); if (!result.rowCount) throw new NotFoundException(); return result.rows[0]; }
    try { await this.docs.send(new UpdateCommand({ TableName: 'unidad3-records', Key: { id }, UpdateExpression: 'SET title = :title, detail = :detail, attributes = :attributes', ConditionExpression: 'attribute_exists(id)', ExpressionAttributeValues: { ':title': dto.title, ':detail': dto.detail, ':attributes': attributes } })); }
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
