import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
type Item = { id: string; title: string; detail: string };
type Store = 'sql' | 'nosql';
function App() {
  const [store, setStore] = useState<Store>('sql');
  const [status, setStatus] = useState<Record<string, string>>({});
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState(''); const [detail, setDetail] = useState('');
  const [editing, setEditing] = useState<string | null>(null); const [message, setMessage] = useState('');
  async function request(path: string, options?: RequestInit) {
    const response = await fetch('/api' + path, { ...options, headers: { 'Content-Type': 'application/json' } });
    const body = await response.json(); if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(', ') : body.message || 'Error de conexión'); return body;
  }
  async function refresh(selected: Store) { try { setItems(await request(`/${selected}/records`)); setMessage(''); } catch (e) { setItems([]); setMessage((e as Error).message); } }
  useEffect(() => { let active = true; const poll = async () => { try { const s = await request('/status'); if (active) setStatus(s); } catch { if (active) setStatus({ sql: 'Backend no disponible', nosql: 'Backend no disponible' }); } }; poll(); const timer = setInterval(poll, 5000); return () => { active = false; clearInterval(timer); }; }, []);
  useEffect(() => { setEditing(null); setTitle(''); setDetail(''); void refresh(store); }, [store, status[store]]);
  async function save(e: React.FormEvent) { e.preventDefault(); try { await request(`/${store}/records${editing ? '/' + editing : ''}`, { method: editing ? 'PUT' : 'POST', body: JSON.stringify({ title, detail }) }); setTitle(''); setDetail(''); setEditing(null); await refresh(store); } catch (e) { setMessage((e as Error).message); } }
  async function remove(id: string) { try { await request(`/${store}/records/${id}`, { method: 'DELETE' }); if (editing === id) { setEditing(null); setTitle(''); setDetail(''); } await refresh(store); } catch (e) { setMessage((e as Error).message); } }
  return <main><header><span className="eyebrow">PRÁCTICA GUIADA · UNIDAD 03</span><h1>Tienda Aula<br/><em>productos y opiniones</em></h1><p>Inventario estructurado en RDS y opiniones con atributos variables en DynamoDB. Edita los ejemplos y compara sus necesidades.</p></header>
  <section className="flow"><div><small>01 / PRESENTACIÓN</small><b>React</b><span>Interfaz y solicitudes HTTP</span></div><i>→</i><div><small>02 / LÓGICA</small><b>NestJS</b><span>API, validación y reglas</span></div><i>→</i><div><small>03 / DATOS</small><b>Floci + Docker</b><span>RDS PostgreSQL · DynamoDB</span></div></section>
  <section className="workspace"><div className="section-title"><div><span className="eyebrow">LABORATORIO INTERACTIVO</span><h2>Administra la tienda</h2></div><p>Selecciona un almacén y realiza operaciones CRUD.</p></div><div className="tabs"><button className={store==='sql'?'active':''} onClick={()=>setStore('sql')}>Inventario SQL <small>RDS / PostgreSQL</small></button><button className={store==='nosql'?'active':''} onClick={()=>setStore('nosql')}>NoInventario SQL <small>DynamoDB</small></button></div>
  <div className="notice"><strong>{store==='sql'?'Tabla relacional':'Elementos por clave'}</strong><span>{store==='sql'?'Productos: SKU, precio y existencias obligatorios. El backend exige una estructura común.':'Opiniones con atributos variables: fotos, plataforma, etiquetas y compra verificada.'}</span><b className={status[store]==='Conectado'?'ok':''}>● {status[store] || 'Comprobando'}</b></div>
  <div className="columns"><form onSubmit={save}><h3>{editing?'Editar registro':'Nuevo registro'}</h3><label>Título<input required maxLength={100} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ej. Integración en la nube"/></label><label>Atributos JSON<textarea required maxLength={300} value={detail} onChange={e=>setDetail(e.target.value)} placeholder="Describe el registro"/></label><button className="primary" disabled={status[store]!=='Conectado'}>{editing?'Guardar cambios':'Crear registro'} ↗</button>{editing && <button type="button" onClick={()=>{setEditing(null);setTitle('');setDetail('');}}>Cancelar edición</button>}</form><div><div className="list-title"><h3>Registros <span>{items.length}</span></h3><button onClick={()=>refresh(store)}>Actualizar ↻</button></div>{message && <p role="alert" className="error">{message}</p>}{!items.length && <p className="empty">Aún no hay registros para mostrar.</p>}{items.map(item=><article key={item.id}><div><strong>{item.title}</strong><pre>{(()=>{try{return JSON.stringify(JSON.parse(item.detail),null,2)}catch{return item.detail}})()}</pre><small>{item.id}</small></div><div className="actions"><button onClick={()=>{setEditing(item.id);setTitle(item.title);setDetail(item.detail);}}>Editar</button><button onClick={()=>remove(item.id)}>Eliminar</button></div></article>)}</div></div></section><footer>ENTORNO LOCAL DE APRENDIZAJE <span>React → NestJS → RDS / DynamoDB</span></footer></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
