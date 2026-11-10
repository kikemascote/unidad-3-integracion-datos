# Unidad 3 · Integración de aplicaciones y bases de datos

Práctica demostrativa para observar cómo una aplicación React consume una API NestJS y cómo esta integra dos paradigmas: PostgreSQL mediante RDS y DynamoDB mediante el SDK de AWS. Floci emula los servicios en la computadora; **no se está conectando a AWS real**. La práctica apoya las dos evidencias de la unidad: investigación sobre integración NoSQL y reporte digital de integración y pruebas. Cada estudiante debe elaborar sus propios análisis, capturas y conclusiones.

## Antes de comenzar

- Docker Desktop instalado, abierto y con el motor Linux en ejecución; conexión a Internet para descargar imágenes. Comprueba con `docker info`.
- Puertos locales 8080 y 3000 y 4566 disponibles. El socket de Docker permite a Floci crear el contenedor PostgreSQL; otorga acceso amplio al motor Docker, por lo que este entorno es solo para un equipo de confianza.
- En PowerShell, desde esta carpeta:

```powershell
docker compose up --build
```

Abre http://localhost:8080. La primera vez puede tardar varios minutos en descargar PostgreSQL y preparar RDS. Observa los estados; si alguno no conecta, revisa `docker compose logs backend floci` y reinicia con `docker compose restart backend`. El backend reintenta durante aproximadamente 150 segundos. Se pueden detener los servicios con `docker compose down`. Eliminar volúmenes o recursos de Docker puede borrar datos; Floci crea volúmenes RDS independientes. La persistencia y recuperación entre reinicios dependen de la configuración y versión de Floci; verifica los datos antes de depender de ellos.

## Arquitectura para proyectar

```text
Navegador / React (presentación)
      │ fetch HTTP /api
      ▼
NestJS (lógica, validación, API REST)
      ├── SDK RDS: crea y consulta instancia → driver pg → PostgreSQL SQL
      └── SDK DynamoDB: crea tabla y envía operaciones → DynamoDB NoSQL
                    Floci + Docker, entorno local
```

RDS es un servicio de bases de datos **relacionales**; aquí ejecuta PostgreSQL. DynamoDB es otro servicio de AWS, **NoSQL**, basado en elementos y claves. Floci emula el plano de control de RDS y crea un contenedor PostgreSQL real; DynamoDB se emula dentro de Floci. RDS y DynamoDB no son dos motores del mismo servicio. No hay sincronización automática entre ambos: al cambiar de pestaña se consulta otro almacén independiente.

## Recorrido para el docente

1. Proyecta el esquema anterior. Pregunta: ¿por qué el navegador no se conecta directamente a la base? Señala que NestJS centraliza validación, reglas y acceso a datos.
2. Abre `compose.yaml`. Identifica Floci, backend, frontend, red y socket. Explica que el socket permite crear el motor RDS y que el nombre `floci` se resuelve dentro de la red de Compose.
3. En `backend/src/service.ts`, muestra `config`, `RDSClient`, `DynamoDBClient` y `DynamoDBDocumentClient`: endpoint local, región y credenciales ficticias. Los SDK envían solicitudes al emulador, no a AWS.
4. En `prepareSql`, explica `DescribeDBInstances`, `CreateDBInstance`, endpoint, `Pool` y `CREATE TABLE`. RDS administra la instancia; el driver `pg` habla con PostgreSQL usando el endpoint devuelto. Los reintentos esperan a que el motor acepte conexiones. RDS reportar disponible no garantiza por sí solo que PostgreSQL responda.
5. En `prepareNoSql`, explica `DescribeTable`, `CreateTable` y la clave de partición `id`. Los atributos `title` y `detail` se guardan en elementos sin declararlos como columnas al crear la tabla.
6. En `backend/src/module.ts`, muestra controlador, rutas y DTO. `ValidationPipe` rechaza campos extra y valida longitud y tipo. El controlador entrega el trabajo al servicio. Las rutas son `GET/POST /api/{sql|nosql}/records` y `PUT/DELETE /api/{sql|nosql}/records/:id`.
7. En `service.ts`, compara `INSERT`, `SELECT`, `UPDATE`, `DELETE` y parámetros `$1` con `Put`, `Scan`, `Update`, `Delete` de DynamoDB. Los parámetros separan valores de la consulta SQL. Las condiciones NoSQL evitan actualizar o eliminar elementos inexistentes. `Scan` recorre páginas y sirve para esta práctica pequeña; no es la consulta recomendada para grandes volúmenes.
8. En `frontend/src/main.tsx`, explica estado de React, `fetch`, conversión JSON, selección del almacén, formulario y actualización de pantalla. Nginx en `frontend/nginx.conf` reenvía `/api` a NestJS: el navegador usa el mismo origen.
9. Crea, consulta, edita y elimina un registro SQL. Cambia a NoSQL y repite. Comprueba que los registros son independientes y observa la pestaña Network del navegador para relacionar método HTTP, URL y respuesta JSON. Captura pantalla de cada operación y de ambos estados.
10. Explica errores: si un servicio no está disponible, el estado se muestra en pantalla y su API responde 503. Prueba campos vacíos y solicitudes inválidas; el backend no debe confiar solo en el formulario. El estado mostrado es el último resultado de inicialización, no una comprobación continua de salud de las bases.

## Guía para evidencia 1: investigación NoSQL

Investiga y explica con tus palabras: servicios administrados y nube; NoSQL y modelo clave/elemento; clave de partición y patrones de acceso; SDK, endpoint, región, credenciales y autenticación; consumo mediante API REST y JSON; diferencias entre SQL y NoSQL; ventajas y límites de emulación local. Incluye un diagrama, comparación argumentada, referencias y conclusiones propias. Consulta fuentes técnicas actuales y registra fecha de consulta. La práctica es ejemplo, no reemplaza la investigación.

## Guía para evidencia 2: reporte de integración

Incluye: problema y objetivo; requisitos; diagrama de tres capas y tecnologías; pasos reales de instalación; configuración y endpoints sin credenciales reales; explicación de conexiones y código relevante; capturas propias con fecha y resultados; tabla de pruebas con método, entrada, resultado esperado y observado para CRUD en ambos almacenes, validación y falla de conexión; dificultades y soluciones; conclusión individual y fuentes. No afirmes haber conectado AWS real cuando solo se utilizó Floci.

| Prueba | Acción | Resultado esperado |
|---|---|---|
| Crear SQL | POST con título y detalle | Registro con id aparece en SQL |
| Consultar SQL | GET de SQL | Lista contiene el registro |
| Actualizar SQL | PUT con id existente | Valores modificados aparecen |
| Eliminar SQL | DELETE con id existente | Registro desaparece |
| CRUD NoSQL | Repetir cuatro acciones en NoSQL | Mismos resultados en el almacén independiente |
| Validación | POST con título vacío | Respuesta 400 |
| Ausencia | PUT o DELETE con id inexistente | Respuesta 404 |

## De la simulación a la nube

En AWS real se provisionan RDS y DynamoDB en una cuenta, se configura conectividad de red, permisos IAM de mínimo privilegio, gestión de secretos, TLS, copias de seguridad y monitoreo. Se deben cambiar endpoint y credenciales, revisar costos y adaptar el aprovisionamiento; no ejecutes esta inicialización de demostración contra una cuenta real. Contraseñas locales, falta de autenticación de la API y Docker socket son decisiones exclusivas del laboratorio. En producción agrega autenticación, autorización, observabilidad, paginación apropiada y protección de datos.

## Referencias

- [Floci: proyecto y servicios](https://github.com/floci-io/floci)
- [Floci: RDS y contenedores](https://floci.io/floci/services/rds/)
- [Floci: configuración Docker](https://floci.io/floci/configuration/docker/)
- [AWS: DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html)
- [AWS: Amazon RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Welcome.html)
- [NestJS: controladores](https://docs.nestjs.com/controllers)

## Instrucciones detalladas para replicar en Windows

### 1. Preparar el equipo y obtener el proyecto

1. Instala Docker Desktop con soporte de contenedores Linux, Git y, para consultar el código, un editor como VS Code. Docker Desktop debe estar abierto y mostrar que el motor está funcionando.
2. Abre PowerShell y verifica `docker --version`, `docker compose version` y `docker info`. Si el último comando falla, inicia Docker Desktop y espera a que termine de arrancar.
3. Clona el repositorio y entra en su carpeta:

```powershell
git clone https://github.com/kikemascote/unidad-3-integracion-datos.git
cd unidad-3-integracion-datos
```

### 2. Levantar Floci y observarlo

`compose.yaml` es la receta del laboratorio. `image: floci/floci:latest` usa la imagen local si ya está descargada; de lo contrario Docker la descarga. La línea `4566:4566` publica el endpoint de AWS emulado solo en la propia computadora. El volumen `/var/run/docker.sock` permite a Floci pedir al motor Docker que cree PostgreSQL. La red `unidad3_red` permite que el backend y los contenedores creados por Floci se encuentren.

Para levantar solo el emulador primero:

```powershell
docker compose up -d floci
docker compose ps
docker compose logs --tail 50 floci
```

Para levantar las tres capas, sin necesidad de parar Floci:

```powershell
docker compose up --build -d
docker compose ps
docker compose logs -f backend
```

La primera ejecución descarga y construye imágenes, y además Floci descarga PostgreSQL cuando recibe la solicitud RDS. Detén la visualización de registros con Ctrl+C: esto no detiene los contenedores. Abre http://localhost:8080 y espera ambos estados **Conectado**. La API responde en http://localhost:3000/api/status. Para apagar el laboratorio usa `docker compose down`; no agrega `-v`, de modo que no solicita eliminar los volúmenes de Compose. Los volúmenes RDS creados por Floci se administran por separado.

### 3. Seguir la conexión de extremo a extremo

1. React envía `fetch('/api/sql/records')` o `fetch('/api/nosql/records')`. El proxy de Nginx reenvía `/api/` al contenedor `backend:3000`, sin credenciales de base de datos en el navegador.
2. NestJS recibe la ruta en `AppController`, valida el cuerpo con `RecordDto` y llama `DataService`. Los valores `sql` y `nosql` seleccionan la implementación.
3. En el arranque, `DataService` usa el endpoint interno `http://floci:4566`, región y credenciales ficticias para construir los clientes AWS. `CreateDBInstance` solicita una instancia PostgreSQL; `DescribeDBInstances` devuelve su dirección y puerto. Con estos datos y el usuario local, `pg.Pool` abre conexiones y crea la tabla `records`.
4. Para NoSQL, `DescribeTable` comprueba si existe `unidad3-records` y `CreateTable` la crea con `id` como clave de partición. El cliente de documentos convierte objetos JavaScript para DynamoDB.
5. Al guardar, el backend genera un UUID. En SQL usa una sentencia parametrizada; en DynamoDB envía un objeto mediante `PutCommand`. Al consultar, modificar o eliminar usa las operaciones correspondientes. La respuesta vuelve por NestJS y Nginx hasta React.
6. Abre las herramientas de desarrollo del navegador, pestaña Network, y observa método, URL, JSON y código de respuesta. Cambia entre SQL y NoSQL: los datos no se copian entre almacenes.

Para investigar fallas, ejecuta `docker compose logs --tail 100 backend floci`, comprueba que el socket esté montado y que Docker Desktop esté en modo Linux. Si ya se usa el puerto 4566 por otra demostración, detén esa demostración antes de iniciar esta; no borres sus volúmenes. Si la descarga del motor tarda más que los reintentos del backend, ejecuta `docker compose restart backend` después de que termine. La guía usa recursos locales de práctica y no requiere una cuenta AWS.

### Persistencia comprobada

El laboratorio configura `FLOCI_STORAGE_MODE=persistent` y guarda el estado de Floci en el volumen de Compose montado en `/app/data`. PostgreSQL utiliza un volumen creado por Floci para su instancia RDS. Se comprobó creando un registro en cada almacén, reiniciando Floci y el backend y consultando ambos registros. No elimines volúmenes si necesitas conservar la práctica. La etiqueta `latest` puede cambiar; esta demostración se verificó con Floci 2.1.0 y conviene revisar la compatibilidad si se actualiza.

### Modo de desarrollo con recarga automática

Con Docker Desktop activo, ejecuta `docker compose up -d floci backend`. Instala Node.js 22 y, desde la raíz del proyecto, ejecuta `npm install` y `npm run dev -w frontend`. Abre http://localhost:5173. Vite recarga los cambios del frontend y su proxy envía `/api` al backend del puerto 3000. Para detener Vite usa Ctrl+C; los contenedores se detienen con `docker compose down`. El frontend de Compose en http://localhost:8080 es una compilación servida por Nginx y no tiene recarga automática.

## Caso de negocio Tienda Aula

RDS conserva cinco productos con SKU, precio y existencias. DynamoDB conserva cinco opiniones distintas con atributos opcionales (foto, plataforma, etiquetas, compra verificada). Edita los atributos JSON de un registro y guarda: en inventario se exigen `sku`, `price` y `stock`; en opiniones puedes agregar campos propios. Los atributos NoSQL se almacenan también como mapa nativo `attributes`.

La inicialización incorpora ejemplos con identificadores estables y no sobrescribe las ediciones existentes. Si se elimina una semilla, reaparece en el siguiente arranque. Esta versión introductoria mantiene el producto serializado en `detail` y valida su estructura en NestJS; no demuestra todavía columnas numéricas, relaciones, transacciones ni restricciones relacionales de inventario. Para discutir el siguiente paso, propone separar productos, pedidos y sus partidas en tablas y usar una transacción al descontar existencias. DynamoDB también puede guardar inventario y SQL también puede guardar reseñas: la elección depende de patrones de acceso y requisitos, no del nombre de la entidad.
