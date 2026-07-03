const db = require('./database');

const compras = [
  {numero:1,id:'PC-0001',desc:'Servidor rack Dell PowerEdge R750',solicitante:'Ricardo Lopes',depto:'TI',valor:48500,status:'Pendente',prazo:'25/06/2025',prioridade:'Alta',obs:'Aprovação diretoria pendente',data_abertura:'10/06/2025 08:00',data_conclusao:null},
  {numero:2,id:'PC-0002',desc:'Licenças Microsoft 365 Business (50 usuários)',solicitante:'Fernanda Silva',depto:'TI',valor:12800,status:'Aprovado',prazo:'20/06/2025',prioridade:'Alta',obs:'PO emitida',data_abertura:'11/06/2025 09:30',data_conclusao:null},
  {numero:3,id:'PC-0003',desc:'Cadeiras ergonômicas — 10 unidades',solicitante:'Mariana Costa',depto:'RH',valor:6200,status:'Em cotação',prazo:'30/06/2025',prioridade:'Média',obs:'3 fornecedores consultados',data_abertura:'12/06/2025 10:00',data_conclusao:null},
  {numero:4,id:'PC-0004',desc:'Cabos de rede Cat6 (bobina 305m)',solicitante:'Paulo Mendes',depto:'TI',valor:890,status:'Entregue',prazo:'10/06/2025',prioridade:'Baixa',obs:'Recebido em 09/06',data_abertura:'01/06/2025 08:00',data_conclusao:'09/06/2025 14:00'},
  {numero:5,id:'PC-0005',desc:'Nobreak APC Smart-UPS 3000VA',solicitante:'Ricardo Lopes',depto:'TI',valor:4700,status:'Aprovado',prazo:'22/06/2025',prioridade:'Alta',obs:'Aguardando entrega',data_abertura:'13/06/2025 11:00',data_conclusao:null},
  {numero:6,id:'PC-0006',desc:'Switch gerenciável 48 portas Cisco',solicitante:'Paulo Mendes',depto:'TI',valor:9800,status:'Em cotação',prazo:'28/06/2025',prioridade:'Alta',obs:'Aguardando aprovação',data_abertura:'14/06/2025 09:00',data_conclusao:null},
  {numero:7,id:'PC-0007',desc:'Monitor 27" 4K — 5 unidades',solicitante:'Fernanda Silva',depto:'TI',valor:8750,status:'Pendente',prazo:'02/07/2025',prioridade:'Média',obs:'',data_abertura:'15/06/2025 14:00',data_conclusao:null},
];

const manutencao = [
  {numero:1,id:'MNT-0001',desc:'Falha no ar-condicionado — Sala de Servidores',local:'Data Center',tipo:'Refrigeração',resp:'Carlos M.',status:'Crítico',sla:'2h',prioridade:'Alta',data_abertura:'18/06/2025 08:12',data_conclusao:null},
  {numero:2,id:'MNT-0002',desc:'Troca de lâmpadas LED — Corredor B',local:'2º Andar',tipo:'Elétrica',resp:'Ana P.',status:'Concluído',sla:'8h',prioridade:'Baixa',data_abertura:'17/06/2025 14:30',data_conclusao:'17/06/2025 16:45'},
  {numero:3,id:'MNT-0003',desc:'Vazamento hidráulico — Banheiro masculino',local:'3º Andar',tipo:'Hidráulica',resp:'João S.',status:'Em andamento',sla:'4h',prioridade:'Alta',data_abertura:'17/06/2025 11:05',data_conclusao:null},
  {numero:4,id:'MNT-0004',desc:'Revisão gerador de emergência',local:'Subsolo',tipo:'Elétrica',resp:'—',status:'Aberto',sla:'12h',prioridade:'Alta',data_abertura:'18/06/2025 07:45',data_conclusao:null},
  {numero:5,id:'MNT-0005',desc:'Alarme de incêndio disparando — Ala C',local:'Ala C',tipo:'Segurança',resp:'Ana P.',status:'Concluído',sla:'1h',prioridade:'Alta',data_abertura:'18/06/2025 10:22',data_conclusao:'18/06/2025 11:00'},
  {numero:6,id:'MNT-0006',desc:'Curto-circuito painel elétrico — Bloco D',local:'Bloco D',tipo:'Elétrica',resp:'João S.',status:'Crítico',sla:'1h',prioridade:'Alta',data_abertura:'18/06/2025 09:50',data_conclusao:null},
];

const links = [
  {id:'LNK-001',nome:'Link Principal — Claro',tipo:'Fibra Dedicada',ip:'200.152.38.11',velocidade:'200 Mbps',latencia:8,uptime:99.97,status:'online',ultima:'18/06/2025 11:45'},
  {id:'LNK-002',nome:'Link Backup — Vivo',tipo:'ADSL',ip:'189.40.12.87',velocidade:'50 Mbps',latencia:42,uptime:98.20,status:'online',ultima:'18/06/2025 11:45'},
  {id:'LNK-003',nome:'VPN — Matriz SP',tipo:'VPN MPLS',ip:'10.0.0.1',velocidade:'100 Mbps',latencia:18,uptime:99.50,status:'online',ultima:'18/06/2025 11:45'},
  {id:'LNK-004',nome:'Link Filial RJ',tipo:'Fibra',ip:'177.66.34.22',velocidade:'100 Mbps',latencia:95,uptime:92.10,status:'degraded',ultima:'18/06/2025 11:44'},
  {id:'LNK-005',nome:'SDWAN — Gartner Cloud',tipo:'SD-WAN',ip:'52.67.180.4',velocidade:'500 Mbps',latencia:null,uptime:78.50,status:'offline',ultima:'18/06/2025 10:20'},
  {id:'LNK-006',nome:'Link Câmeras Segurança',tipo:'Fibra',ip:'192.168.10.1',velocidade:'50 Mbps',latencia:5,uptime:100,status:'online',ultima:'18/06/2025 11:45'},
];

async function popular() {
  await db.run('DELETE FROM compras');
  await db.run('DELETE FROM manutencao');
  await db.run('DELETE FROM links');
  await db.run('DELETE FROM links_chamados');
  await db.run('UPDATE contadores SET ultimo = 0');

  for (const c of compras) {
    await db.run(`
      INSERT INTO compras (id, numero, "desc", solicitante, depto, valor, status, prazo, prioridade, obs, data_abertura, data_conclusao)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `, [c.id, c.numero, c.desc, c.solicitante, c.depto, c.valor, c.status, c.prazo, c.prioridade, c.obs, c.data_abertura, c.data_conclusao]);
  }
  await db.run("UPDATE contadores SET ultimo = 7 WHERE modulo = 'compras'");

  for (const m of manutencao) {
    await db.run(`
      INSERT INTO manutencao (id, numero, "desc", local, tipo, resp, status, sla, prioridade, data_abertura, data_conclusao)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `, [m.id, m.numero, m.desc, m.local, m.tipo, m.resp, m.status, m.sla, m.prioridade, m.data_abertura, m.data_conclusao]);
  }
  await db.run("UPDATE contadores SET ultimo = 6 WHERE modulo = 'manutencao'");

  for (const l of links) {
    await db.run(`
      INSERT INTO links (id, nome, tipo, ip, velocidade, latencia, uptime, status, ultima)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [l.id, l.nome, l.tipo, l.ip, l.velocidade, l.latencia, l.uptime, l.status, l.ultima]);
  }

  console.log('Banco de dados populado com sucesso!');
}

if (require.main === module) {
  db.init()
    .then(popular)
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = popular;
