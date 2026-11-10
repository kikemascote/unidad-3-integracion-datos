// Aprovisionamiento administrativo: nunca ejecutado por la identidad de la aplicación.
const fs=require('fs');
const {randomBytes}=require('crypto');
const {IAMClient,CreateUserCommand,CreateAccessKeyCommand,PutUserPolicyCommand,CreateRoleCommand,PutRolePolicyCommand}=require('@aws-sdk/client-iam');
const {RDSClient,DescribeDBInstancesCommand,CreateDBInstanceCommand}=require('@aws-sdk/client-rds');
const {DynamoDBClient,DescribeTableCommand,CreateTableCommand}=require('@aws-sdk/client-dynamodb');
const {SecretsManagerClient,CreateSecretCommand,GetSecretValueCommand}=require('@aws-sdk/client-secrets-manager');
const config={endpoint:process.env.AWS_ENDPOINT_URL,region:'us-east-1',credentials:{accessKeyId:'floci',secretAccessKey:'floci'}};
const iam=new IAMClient(config), rds=new RDSClient(config), db=new DynamoDBClient(config), secrets=new SecretsManagerClient(config);
async function exists(action,create,names){try{return await action()}catch(e){if(!names.some(n=>e.name===n || e.name===n+'Exception'))throw e;return create()}}
(async()=>{
 let ready=false; for(let i=0;i<60;i++){try{await iam.send(new CreateUserCommand({UserName:'tienda-workload'}));ready=true;break}catch(e){if(e.name.startsWith('EntityAlreadyExists')){ready=true;break}await new Promise(r=>setTimeout(r,1000))}}if(!ready)throw Error('IAM no disponible');
 const userArn='arn:aws:iam::000000000000:user/tienda-workload',roleArn='arn:aws:iam::000000000000:role/tienda-runtime';
 await exists(()=>iam.send(new CreateRoleCommand({RoleName:'tienda-runtime',AssumeRolePolicyDocument:JSON.stringify({Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{AWS:userArn},Action:'sts:AssumeRole'}]})})),()=>{},['EntityAlreadyExists']);
 await iam.send(new PutUserPolicyCommand({UserName:'tienda-workload',PolicyName:'AssumeOnlyRuntime',PolicyDocument:JSON.stringify({Version:'2012-10-17',Statement:[{Effect:'Allow',Action:'sts:AssumeRole',Resource:'*'}]})}));
 let secret;try{secret=JSON.parse((await secrets.send(new GetSecretValueCommand({SecretId:'tienda/database'}))).SecretString)}catch(e){if(e.name!=='ResourceNotFoundException')throw e;secret={username:'docente',password:randomBytes(24).toString('hex')};await secrets.send(new CreateSecretCommand({Name:'tienda/database',SecretString:JSON.stringify(secret)}))}
 await exists(()=>rds.send(new DescribeDBInstancesCommand({DBInstanceIdentifier:'unidad3-postgres'})),()=>rds.send(new CreateDBInstanceCommand({DBInstanceIdentifier:'unidad3-postgres',DBInstanceClass:'db.t3.micro',Engine:'postgres',MasterUsername:secret.username,MasterUserPassword:secret.password,AllocatedStorage:20,DBName:'practica'})),['DBInstanceNotFound','DBInstanceNotFoundFault']);
 await exists(()=>db.send(new DescribeTableCommand({TableName:'unidad3-records'})),()=>db.send(new CreateTableCommand({TableName:'unidad3-records',AttributeDefinitions:[{AttributeName:'id',AttributeType:'S'}],KeySchema:[{AttributeName:'id',KeyType:'HASH'}],BillingMode:'PAY_PER_REQUEST'})),['ResourceNotFoundException']);
 const policy={Version:'2012-10-17',Statement:[{Effect:'Allow',Action:['dynamodb:Scan','dynamodb:PutItem','dynamodb:UpdateItem','dynamodb:DeleteItem','dynamodb:DescribeTable'],Resource:'arn:aws:dynamodb:us-east-1:000000000000:table/unidad3-records'},{Effect:'Allow',Action:'rds:DescribeDBInstances',Resource:'*'},{Effect:'Allow',Action:'secretsmanager:GetSecretValue',Resource:'arn:aws:secretsmanager:us-east-1:000000000000:secret:tienda/database*'}]};
 await iam.send(new PutRolePolicyCommand({RoleName:'tienda-runtime',PolicyName:'RuntimeDataOnly',PolicyDocument:JSON.stringify(policy)}));
 if(!fs.existsSync('/identity/runtime.json')){const key=(await iam.send(new CreateAccessKeyCommand({UserName:'tienda-workload'}))).AccessKey;fs.writeFileSync('/identity/runtime.json',JSON.stringify({roleArn,credentials:{accessKeyId:key.AccessKeyId,secretAccessKey:key.SecretAccessKey}}),{mode:0o600})}
 console.log('IAM, rol STS, secreto, RDS y DynamoDB preparados. Credenciales no impresas.');
})().catch(e=>{console.error(e.name,e.message);process.exit(1)});
