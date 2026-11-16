/* Interpretação de pedidos em português (voz ou texto) para o assistente Mob.
   Funciona offline, por regras — sem enviar a fala a nenhum serviço de IA.
   Funções puras, testáveis em Node. */
(function (g) {
  'use strict';

  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const U = { zero:0, um:1, uma:1, dois:2, duas:2, tres:3, quatro:4, cinco:5, seis:6, sete:7, oito:8, nove:9, dez:10,
    onze:11, doze:12, treze:13, catorze:14, quatorze:14, quinze:15, dezesseis:16, dezessete:17, dezoito:18, dezenove:19,
    vinte:20, trinta:30, quarenta:40, cinquenta:50, sessenta:60, setenta:70, oitenta:80, noventa:90,
    cem:100, cento:100, duzentos:200, trezentos:300, quatrocentos:400, quinhentos:500, seiscentos:600,
    setecentos:700, oitocentos:800, novecentos:900 };

  // "duzentos e cinquenta mil" -> "250000". Números pequenos soltos (um, dois...) ficam como palavra.
  function wordsToDigits(t) {
    const toks = String(t).split(/\s+/).filter(Boolean);
    const out = [];
    let i = 0;
    while (i < toks.length) {
      const w = toks[i];
      if ((w === 'mil' || /^milh(ao|oes)$/.test(w)) && out.length && /^\d/.test(out[out.length - 1])) { out.push(w); i++; continue; }
      if (w in U || w === 'mil' || /^milh(ao|oes)$/.test(w)) {
        let total = 0, cur = 0, j = i, lastNum = false, mag = false;
        while (j < toks.length) {
          const x = toks[j];
          if (x in U) { cur += U[x]; lastNum = true; j++; }
          else if (x === 'mil') { total += (cur || 1) * 1000; cur = 0; lastNum = true; mag = true; j++; }
          else if (/^milh(ao|oes)$/.test(x)) { total += (cur || 1) * 1e6; cur = 0; lastNum = true; mag = true; j++; }
          else if (x === 'e' && lastNum && j + 1 < toks.length && toks[j + 1] in U) { lastNum = false; j++; }
          else break;
        }
        const v = total + cur;
        if (v < 10 && !mag) out.push(...toks.slice(i, j)); else out.push(String(v));
        i = j;
      } else { out.push(w); i++; }
    }
    return out.join(' ');
  }

  function numPT(s) {
    s = String(s).replace(/[^\d,.]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    return parseFloat(s) || 0;
  }

  // Remove do texto o trecho que casou e devolve [valor, textoRestante].
  function pegar(t, re) {
    const m = re.exec(t);
    if (!m) return [null, t];
    return [m, t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length)];
  }

  /* Extrai parâmetros numéricos de um pedido. Devolve também a lista de valores em reais. */
  function extrairNumeros(raw) {
    let t = wordsToDigits(norm(raw).replace(/\bpor cento\b/g, '%').replace(/([,;:?!])(\s|$)/g, ' $1 ').replace(/\s+/g, ' '));
    const r = { valores: [] };
    let m;

    [m, t] = pegar(t, /\(?\b\d{2}\)?\s*9?\d{4}[- ]?\d{4}\b/);                      // telefone
    if (m) r.telefone = m[0].replace(/\D/g, '');

    [m, t] = pegar(t, /(?:contempla\w*\s*(?:no|em|na|para|pro|pra)?\s*)?\bmes\s*(?:de\s*contemplacao\s*)?(?:no\s*)?(\d{1,3})\b/);
    if (!m) [m, t] = pegar(t, /\b(\d{1,3})\s*(?:o|º|°)?\s*mes\b/);
    if (!m) [m, t] = pegar(t, /contempla\w*\s*(?:no|em|na|para|pro|pra)?\s*(?:o\s*)?(\d{1,3})\b/);
    if (m) r.mes = parseInt(m[1]);

    [m, t] = pegar(t, /\bprazo\s*(?:de\s*)?(\d{2,3})\b(?:\s*meses)?/);
    if (!m) [m, t] = pegar(t, /\b(\d{2,3})\s*meses\b/);
    if (m) r.prazo = parseInt(m[1]);

    [m, t] = pegar(t, /\btaxa(?:\s*(?:de\s*)?adm\w*)?\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(?:%|por cento)?/);
    if (m) r.taxa = numPT(m[1]);

    [m, t] = pegar(t, /\bembutid\w*\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(?:%|por cento)?/);
    if (m) r.pctEmb = numPT(m[1]);
    [m, t] = pegar(t, /\b(?:recursos\s*)?proprio\w*\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(?:%|por cento)?/);
    if (m) r.pctProp = numPT(m[1]);
    [m, t] = pegar(t, /\blance\s*(?:total\s*)?(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(?:%|por cento)/);
    if (m) r.lanceTotal = numPT(m[1]);

    [m, t] = pegar(t, /\bentrada\s*(?:de\s*)?(?:r\$\s*)?(\d[\d.,]*)\s*(mil|k)?/);
    if (m) r.entrada = numPT(m[1]) * (m[2] ? 1000 : 1) || undefined;
    if (r.entrada && r.entrada < 1000) r.entrada *= 1000;

    [m, t] = pegar(t, /\bcdi\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(?:%|por cento)?/);
    if (m) r.cdi = numPT(m[1]);
    [m, t] = pegar(t, /\b(\d+(?:[.,]\d+)?)\s*(?:%|por cento)\s*(?:do|de)\s*cdi\b/);
    if (m) r.pctCdi = numPT(m[1]);
    [m, t] = pegar(t, /\b(\d+(?:[.,]\d+)?)\s*(?:%|por cento)\s*(?:ao|a\.?)\s*mes\b/);
    if (m) r.taxaAm = numPT(m[1]);

    // valores em reais restantes
    const re = /(\d[\d.,]*)\s*(mil|milhao|milhoes|k)?\b/g;
    let x;
    const achados = [];
    while ((x = re.exec(t))) {
      let v = numPT(x[1]);
      if (!v) continue;
      const mult = x[2] ? (x[2][0] === 'm' && x[2].length > 3 ? 1e6 : 1000) : 1;
      achados.push({ v: v * mult, unidade: !!x[2] });
    }
    // "200, 300 e 400 mil": os sem unidade herdam o "mil"; sozinhos abaixo de mil também são milhares.
    r.valores = achados.map(a => (a.v < 1000 ? a.v * 1000 : a.v)).filter(v => v >= 1000);
    return r;
  }

  const STOP_NOME = new Set(['gera','gerar','monta','montar','compara','comparar','faz','fazer','cria','criar','proposta','propostas',
    'simulacao','simulacoes','cena','mes','mês','me','lembra','lembrar','anota','anotar','cliente','clientes','carta','credito',
    'crédito','consorcio','consórcio','financiamento','price','sac','renda','fixa','auto','imovel','imóvel','moto','pesados',
    'segunda','terça','terca','quarta','quinta','sexta','sábado','sabado','domingo','amanhã','amanha','hoje','ligar','retorno',
    'cdi','lance','taxa','prazo','entrada','novo','nova','muda','mudar','fechei','fechou','vendi','abre','abrir','mostra','mostrar']);
  const STOP_FALLBACK = new Set(['carta','de','com','credito','valor','em','no','na','mes','contempla','contemplacao','lance','taxa','prazo',
    'entrada','financiamento','renda','fixa','price','sac','consorcio','auto','imovel','moto','pesados','um','uma','para','pro','pra','do','da']);

  const maiuscula = w => /^\p{Lu}/u.test(w);

  /* Nomes de clientes citados. 1) palavras capitalizadas (após o 1º termo); 2) fallback para texto em minúsculas. */
  function extrairNomes(raw, conhecidos = []) {
    const nRaw = norm(raw);
    const acha = n => { const m = new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').exec(nRaw); return m ? m.index : -1; };
    const mapear = nome => {
      const p = norm(nome).split(/\s+/)[0];
      return conhecidos.find(c => norm(c).split(/\s+/)[0] === p) || nome;
    };
    const cands = [];
    const toks = raw.replace(/([,;:?!])/g, ' $1 ').split(/\s+/).filter(Boolean);
    let atual = [];
    const fecha = () => { if (atual.length) cands.push(atual.join(' ')); atual = []; };
    toks.forEach((w, i) => {
      const limpo = w.replace(/[.]/g, '');
      if (i > 0 && maiuscula(limpo) && !STOP_NOME.has(norm(limpo)) && /^\p{L}+$/u.test(limpo)) atual.push(limpo);
      else fecha();
    });
    fecha();
    let nomes = cands.map(mapear);

    if (!nomes.length) {
      // minúsculas: clientes já cadastrados citados pelo primeiro nome
      for (const c of conhecidos) {
        const p = norm(c).split(/\s+/)[0];
        if (p.length >= 3 && acha(p) >= 0) nomes.push(c);
      }
      nomes.sort((x, y) => acha(norm(x).split(/\s+/)[0]) - acha(norm(y).split(/\s+/)[0]));
    }
    if (nomes.length) return [...new Set(nomes)];

    // fallback: minúsculas — nomes depois de pro/pra/para/do/da/cliente, em lista "A, B e C"
    const lower = toks.map(w => norm(w));
    for (let i = 0; i < lower.length; i++) {
      if (!['pro', 'pra', 'para', 'do', 'da', 'cliente'].includes(lower[i])) continue;
      let j = i + 1;
      if (['o', 'a'].includes(lower[j])) j++;
      let primeiro = true;
      while (j < lower.length) {
        const w = lower[j];
        if (/^\d/.test(w) || STOP_FALLBACK.has(w) || /^[,;:?!]$/.test(w) && primeiro) break;
        if (w === ',' || w === 'e') { j++; primeiro = false; continue; }
        if (/^[;:?!]$/.test(w)) break;
        if (!/^\p{L}+$/u.test(w)) break;
        nomes.push(w[0].toUpperCase() + w.slice(1));
        j++; primeiro = false;
        if (lower[j] !== ',' && lower[j] !== 'e') break;
      }
      if (nomes.length) break;
    }
    return nomes;
  }

  function categoria(n) {
    if (/\b(imovel|casa|apartamento|terreno|imoveis)\b/.test(n)) return 'imovel';
    if (/\b(pesad\w*|caminha\w*|carreta|trator|onibus|cavalo)\b/.test(n)) return 'pesados';
    if (/\bmoto\w*\b/.test(n)) return 'moto';
    if (/\b(auto|carro|automovel|veiculo)\b/.test(n)) return 'auto';
    return null;
  }

  const DIAS = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };

  /* Data/hora de retorno: "quinta às 10", "amanhã 14h30", "dia 20", "hoje às 16". Devolve Date ou null. */
  function extrairRetorno(raw, agora = new Date()) {
    const n = norm(raw);
    let d = null;
    if (/\bdepois de amanha\b/.test(n)) { d = new Date(agora); d.setDate(d.getDate() + 2); }
    else if (/\bamanha\b/.test(n)) { d = new Date(agora); d.setDate(d.getDate() + 1); }
    else if (/\bhoje\b/.test(n)) { d = new Date(agora); }
    else {
      const m = /\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/.exec(n);
      if (m) {
        d = new Date(agora);
        let diff = (DIAS[m[1]] - d.getDay() + 7) % 7;
        if (diff === 0) diff = 7;
        d.setDate(d.getDate() + diff);
      } else {
        const md = /\bdia\s*(\d{1,2})\b/.exec(n);
        if (md) {
          d = new Date(agora);
          d.setDate(parseInt(md[1]));
          if (d < agora) d.setMonth(d.getMonth() + 1);
        }
      }
    }
    if (!d) return null;
    const nw = wordsToDigits(n);
    const mh = /\b(?:as|a|de)?\s*(\d{1,2})\s*(?:h|:|horas?)\s*(\d{2})?/.exec(nw) || /\bas\s+(\d{1,2})\b/.exec(nw);
    let h = 9, mi = 0;
    if (mh) { h = parseInt(mh[1]); mi = mh[2] ? parseInt(mh[2]) : 0; if (h <= 7 && /tarde|noite/.test(n)) h += 12; }
    d.setHours(h, mi, 0, 0);
    return d;
  }

  /* Interpreta uma frase. ctx = { conhecidos: [nomes de leads/propostas], agora: Date } */
  function interpretar(raw, ctx = {}) {
    const n = norm(raw);
    const conhecidos = ctx.conhecidos || [];
    const num = extrairNumeros(raw);
    const r = { texto: raw, intent: 'ajuda', num };

    if (/\b(abre|abrir|mostra|mostrar|ver|vai pro|va para|ir para)\b.*\b(crm|funil|painel|clientes|agenda|retornos)\b/.test(n) && !/\b(proposta|lembra)\b/.test(n)) {
      r.intent = 'abrir'; r.destino = /agenda|retorn/.test(n) ? 'crm' : 'crm'; return r;
    }
    if (/\b(abre|abrir|mostra|mostrar|ir para)\b.*\b(configura|marca|logo)\b/.test(n)) { r.intent = 'abrir'; r.destino = 'mais'; return r; }

    if (/\bfinanci/.test(n) && /\bcompar|\bversus\b|\bx\b|\bcontra\b|\bpor que nao\b|\bmonta\b/.test(n)) {
      r.intent = 'financiamento'; r.sistema = /\bprice\b/.test(n) ? 'price' : 'sac';
      r.nomes = extrairNomes(raw, conhecidos); return r;
    }
    if (/\brenda fixa\b|\bcdb\b|\binvestir\b|\binvestidor\b|\bcdi\b/.test(n) && /\bcompar|\bmonta|\bfaz|\bgera|\brenda fixa\b/.test(n)) {
      r.intent = 'rendafixa'; r.nomes = extrairNomes(raw, conhecidos); return r;
    }
    if (/\b(propost\w*|simul\w*|carta de|credito de|cota de)\b/.test(n) && !/\blembra\b/.test(n)) {
      r.intent = 'proposta';
      r.cat = categoria(n);
      r.nomes = extrairNomes(raw, conhecidos);
      return r;
    }
    if (/\b(lembra|lembrar|retorn\w*|ligar|agenda\w*|gostou|interess\w*|fechou|fechei|vendi|vendeu|assinou|desistiu|nao quis|perdi|perdeu|novo cliente|cadastr\w*|anota\w*|conversou|conversar|falei|mandei)\b/.test(n)) {
      r.intent = 'crm';
      r.nomes = extrairNomes(raw, conhecidos);
      r.retorno = extrairRetorno(raw, ctx.agora || new Date());
      r.telefone = num.telefone;
      if (/\b(fechou|fechei|vendi|vendeu|assinou|fechamos|fechado)\b/.test(n)) r.etapa = 'Fechado';
      else if (/\b(desistiu|nao quis|perdi|perdeu|nao vai)\b/.test(n)) r.etapa = 'Perdido';
      else if (/\b(gostou|interess\w*|vai pensar|conversar|vai conversar|negoci\w*)\b/.test(n)) r.etapa = 'Negociação';
      else if (/\b(mandei|enviei)\b.*\bpropost/.test(n)) r.etapa = 'Proposta';
      else if (/\b(ligou|falei|liguei|conversei|contato)\b/.test(n)) r.etapa = 'Contato';
      else if (/\bnovo cliente\b|\bcadastr/.test(n)) r.etapa = 'Novo';
      return r;
    }
    return r;
  }

  // Resposta curta a uma pergunta ("6", "mês 6", "seis", "doze"): devolve o inteiro ou null.
  function numeroSimples(raw) {
    const n = norm(raw);
    const m = /\d+/.exec(n);
    if (m) return parseInt(m[0]);
    for (const w of n.split(/[\s,.;:!?]+/)) if (w in U) return U[w];
    return null;
  }

  const api = { numeroSimples, norm, wordsToDigits, extrairNumeros, extrairNomes, extrairRetorno, categoria, interpretar };
  g.NLU = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
