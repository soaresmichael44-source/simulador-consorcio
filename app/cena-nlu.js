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

  const ORD = { primeiro: 1, segundo: 2, terceiro: 3, quarto: 4, quinto: 5, sexto: 6, setimo: 7, oitavo: 8, nono: 9, decimo: 10 };
  const PEQ = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9 };
  const ALT_ORD = Object.keys(ORD).join('|'), ALT_PEQ = Object.keys(PEQ).join('|');
  // "mês seis", "sexto mês", "contemplando em seis meses" -> "mes 6" (números pequenos ficam como palavra em wordsToDigits)
  function normalizaMes(t) {
    return t
      .replace(new RegExp('\\b(' + ALT_ORD + ')\\s+mes\\b', 'g'), (m, w) => 'mes ' + ORD[w])
      .replace(new RegExp('\\bmes\\s+(?:de\\s+contemplacao\\s+)?(?:no\\s+)?(' + ALT_PEQ + ')\\b', 'g'), (m, w) => 'mes ' + PEQ[w])
      .replace(new RegExp('\\b(?:contempla\\w*|simul\\w*)\\s+(?:no|em|na|para|pro|pra|ate)?\\s*(?:o\\s+)?(' + ALT_PEQ + ')\\s+mes(?:es)?\\b', 'g'), (m, w) => 'mes ' + PEQ[w]);
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
    let t = normalizaMes(wordsToDigits(norm(raw).replace(/\bpor cento\b/g, '%').replace(/([,;:?!])(\s|$)/g, ' $1 ').replace(/\s+/g, ' ')));
    const r = { valores: [] };
    let m;

    [m, t] = pegar(t, /\(?\b\d{2}\)?\s*9?\d{4}[- ]?\d{4}\b/);                      // telefone
    if (m) r.telefone = m[0].replace(/\D/g, '');

    // ---- formato da parcela (plano): meia parcela, reduzida, Light, Renovação 50/70, integral/linear, decrescente/degrau ----
    const plano = {};
    [m, t] = pegar(t, /\b(?:decrescentes?|degrau|escalonad[ao]s?)\b/); if (m) plano.forma = 'degrau';
    [m, t] = pegar(t, /\b(?:super\s*light|meia\s*parcela|metade\s*da\s*parcela|parcelas?\s*pela\s*metade|renovacao\s*50|plano\s*50)\b/); if (m) plano.pct = 50;
    [m, t] = pegar(t, /\b(?:renovacao\s*70|plano\s*70)\b/); if (m) plano.pct = 70;
    [m, t] = pegar(t, /\b(?:plano\s*)?light\b/); if (m && plano.pct == null) plano.pct = 75;
    [m, t] = pegar(t, /\b(\d{1,3})\s*%\s*(?:da|de|do)\s*(?:a\s*)?(?:parcela|fundo\s*comum)\b/); if (m && +m[1] > 0 && +m[1] <= 100) plano.pct = +m[1];
    [m, t] = pegar(t, /\b(?:parcelas?\s*reduzid[ao]s?|reduc\w*)\s*((?:em|de)\s*)?(\d{1,3})\s*%/);
    if (m) { const n = +m[2]; plano.pct = m[1] ? 100 - n : (n >= 50 ? n : 100 - n); }
    [m, t] = pegar(t, /\bcrescentes?\b/); if (m) { plano.crescente = true; if (plano.pct == null) plano.pct = 70; }
    [m, t] = pegar(t, /\breduzid[ao]s?\b/); if (m && plano.pct == null) plano.pct = 70;
    [m, t] = pegar(t, /\b(?:parcelas?\s*)?(?:integrais?|cheias?|inteiras?|linea(?:r|res))\b|\bparcelas?\s*(?:normal|fixas?)\b|\bplano\s*(?:normal|integral)\b/); if (m && plano.pct == null) plano.pct = 100;
    if (plano.pct != null || plano.forma) r.plano = plano;

    // ---- lance: sem lance, em parcelas, embutido, próprio/livre, fixo, total (em % ou em reais) ----
    [m, t] = pegar(t, /\b(?:sem\s*(?:dar\s*)?lance|nao\s*(?:vou\s*|quero\s*)?(?:dar|ofertar)\s*lance|por\s*sorteio)\b/); if (m) r.semLance = true;
    [m, t] = pegar(t, /\blance\s*(?:de\s*|com\s*)?(\d{1,3})\s*parcelas?\b|\b(\d{1,3})\s*parcelas?\s*(?:de\s*)?lance\b/); if (m) r.lanceParcelas = +(m[1] || m[2]);
    [m, t] = pegar(t, /\bembutid\w*\s*(?:de\s*|em\s*)?(\d+(?:[.,]\d+)?)\s*%|(\d+(?:[.,]\d+)?)\s*%\s*(?:de\s*)?embutid\w*/); if (m) r.pctEmb = numPT(m[1] || m[2]);
    [m, t] = pegar(t, /\bembutid\w*\s*(?:de\s*)?(?:r\$\s*)?(\d[\d.,]*)\s*(mil|k)\b/); if (m && r.pctEmb == null) r.embValor = numPT(m[1]) * 1000;
    [m, t] = pegar(t, /\b(?:recursos?\s*)?(?:proprios?|livre)\s*(?:de\s*|em\s*)?(\d+(?:[.,]\d+)?)\s*%|(\d+(?:[.,]\d+)?)\s*%\s*(?:de\s*)?(?:recursos?\s*)?(?:proprios?|livre)\b/); if (m) r.pctProp = numPT(m[1] || m[2]);
    [m, t] = pegar(t, /\b(?:recursos?\s*)?(?:proprios?|livre)\s*(?:de\s*)?(?:r\$\s*)?(\d[\d.,]*)\s*(mil|k)\b/); if (m && r.pctProp == null) r.propValor = numPT(m[1]) * 1000;
    [m, t] = pegar(t, /\blance\s*(?:fixo\s*|total\s*)?(?:de\s*|com\s*|em\s*)?(\d+(?:[.,]\d+)?)\s*%/); if (m) r.lanceTotal = numPT(m[1]);
    [m, t] = pegar(t, /\blance\s*(?:fixo\s*|total\s*)?(?:de\s*|com\s*|em\s*)?(?:r\$\s*)?(\d[\d.,]*)\s*(mil|k|milhao)?\b/);
    if (m && r.lanceTotal == null) { const v = numPT(m[1]) * (m[2] ? (m[2] === 'milhao' ? 1e6 : 1000) : 1); r.lanceValor = v < 1000 ? v * 1000 : v; }

    [m, t] = pegar(t, /(?:contempla\w*\s*(?:no|em|na|para|pro|pra)?\s*)?\bmes\s*(?:de\s*contemplacao\s*)?(?:no\s*)?(\d{1,3})\b/);
    if (!m) [m, t] = pegar(t, /\b(\d{1,3})\s*(?:o|º|°)?\s*mes\b/);
    if (!m) [m, t] = pegar(t, /contempla\w*\s*(?:no|em|na|para|pro|pra)?\s*(?:o\s*)?(\d{1,3})\b/);
    if (m) r.mes = parseInt(m[1]);

    // ---- prazo: "prazo de 80", "80 meses", "80 parcelas", "em 84 vezes", "80x", "7 anos" ----
    let prazo = null;
    [m, t] = pegar(t, /\bprazo\s*(?:de\s*|em\s*|do\s*grupo\s*de\s*|total\s*de\s*)?(\d{1,3})\s*(anos?|meses|parcelas|vezes|x)?\b/);
    if (m) prazo = /^anos?$/.test(m[2] || '') ? +m[1] * 12 : +m[1];
    if (prazo == null) { [m, t] = pegar(t, /\b(\d{1,2})\s*anos?\b/); if (m) prazo = +m[1] * 12; }
    if (prazo == null) { [m, t] = pegar(t, /\b(\d{2,3})\s*(?:meses|parcelas|vezes)\b|\b(\d{2,3})\s*x\b/); if (m) prazo = +(m[1] || m[2]); }
    if (prazo != null && prazo >= 6 && prazo <= 420) r.prazo = prazo;

    [m, t] = pegar(t, /\btaxa\s*(?:de\s*)?(?:adm\w*|administrativ\w*|total)?\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(?:%|por cento)?|(\d+(?:[.,]\d+)?)\s*%\s*de\s*taxa/);
    if (m) r.taxa = numPT(m[1] || m[2]);

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
  const STOP_FALLBACK = new Set(['mim', 'ti', 'si', 'ele', 'ela', 'voce', 'vc', 'nos', 'alguem', 'outro', 'outra', 'carta','de','com','credito','valor','em','no','na','mes','contempla','contemplacao','lance','taxa','prazo',
    'entrada','financiamento','renda','fixa','price','sac','consorcio','auto','imovel','moto','pesados','um','uma','para','pro','pra','do','da']);

  const INICIO = new Set(['quero', 'preciso', 'faz', 'faca', 'fazer', 'simula', 'simular', 'gera', 'gerar', 'monta', 'montar', 'cria', 'criar', 'me', 'pode', 'por', 'favor',
      'nova', 'novo', 'uma', 'um', 'proposta', 'propostas', 'simulacao', 'carta', 'credito', 'cota', 'oi', 'ola', 'mob', 'bom', 'dia', 'boa', 'tarde', 'noite', 'e', 'a', 'o', 'com',
      'no', 'na', 'em', 'ate', 'que', 'la', 'aqui', 'compara', 'comparar', 'abre', 'abrir', 'mostra', 'mostrar', 'lembra', 'anota', 'anotar', 'cliente', 'clientes',
    'eu', 'tu', 'ele', 'ela', 'voce', 'nos', 'gente', 'agora', 'hoje', 'amanha', 'entao', 'olha', 'ei', 'bora', 'tenho', 'poderia', 'consegue', 'podia', 'minha', 'meu', 'nossa', 'novamente',
    'gere', 'crie', 'simule', 'calcule', 'prepare', 'elabore', 'envie', 'manda', 'mande', 'faca', 'preciso', 'queria', 'gostaria', 'precisamos', 'vamos', 'fecha', 'fechei', 'fechou', 'vendi', 'liga', 'ligar', 'anota']);
  // depois de um nome no começo da frase só pode vir: vírgula, número, "carta/crédito/proposta" ou o fim
  const PROX_OK = w => w === undefined || /^[,;:?!]$/.test(w) || /^\d/.test(w) || w in U || w === 'mil' || /^milh/.test(w) || ['carta', 'credito', 'proposta', 'simulacao', 'cota'].includes(w);
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
      const proxima = toks[i + 1];
      const inicioOk = i > 0 || (!INICIO.has(norm(limpo)) && (PROX_OK(proxima && norm(proxima)) || (proxima && maiuscula(proxima.replace(/[.]/g, '')))));
      if (inicioOk && maiuscula(limpo) && !STOP_NOME.has(norm(limpo)) && !(norm(limpo) in U) && /^\p{L}+$/u.test(limpo)) atual.push(limpo);
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
      if (!['pro', 'pra', 'para', 'do', 'da', 'cliente', 'de'].includes(lower[i])) continue;
      let j = i + 1;
      if (['o', 'a'].includes(lower[j])) j++;
      let primeiro = true;
      while (j < lower.length) {
        const w = lower[j];
        if (/^\d/.test(w) || w in U || w === 'mil' || /^milh/.test(w) || STOP_FALLBACK.has(w) || /^[,;:?!]$/.test(w) && primeiro) break;
        if (w === ',' || w === 'e') { j++; primeiro = false; continue; }
        if (/^[;:?!]$/.test(w)) break;
        if (!/^\p{L}+$/u.test(w)) break;
        nomes.push(w[0].toUpperCase() + w.slice(1));
        j++; primeiro = false;
        if (lower[j] !== ',' && lower[j] !== 'e') break;
      }
      if (nomes.length) break;
    }
    if (nomes.length) return nomes;

    // nome logo no começo da frase ("Rafael Souza, carta de 250 mil" / "rafael 250 mil")

    const ini = [];
    for (let i = 0; i < lower.length && ini.length < 3; i++) {
      const w = lower[i];
      if (/^[,;:?!]$/.test(w) || /^\d/.test(w) || w in U || w === 'mil' || STOP_FALLBACK.has(w) || (ini.length === 0 && INICIO.has(w)) || !/^\p{L}+$/u.test(w)) break;
      ini.push(toks[i].replace(/\./g, ''));
    }
    if (ini.length && ini[0].length >= 3 && PROX_OK(lower[ini.length])) nomes.push(ini.map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' '));
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
    if (/\b(propost\w*|simul\w*|carta de|credito de|cota de|consorcio|cotas?|carta)\b/.test(n) && !/\blembra\b/.test(n) && !/\b(gostou|fechou|fechei|vendi|desistiu|conversar)\b/.test(n)) {
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

  // Resposta curta a uma pergunta ("6", "mês 6", "seis", "sexto", "vinte e quatro"): devolve o inteiro ou null.
  function numeroSimples(raw) {
    const n = norm(raw);
    const m = /\d+/.exec(n);
    if (m) return parseInt(m[0]);
    let total = 0, achou = false;
    for (const w of n.split(/[\s,.;:!?]+/).filter(Boolean)) {
      if (w in ORD) return ORD[w];
      if (w in U) { total += U[w]; achou = true; }
      else if (w === 'e' && achou) continue;
      else if (achou) break;
    }
    return achou ? total : null;
  }

  const api = { numeroSimples, norm, wordsToDigits, extrairNumeros, extrairNomes, extrairRetorno, categoria, interpretar };
  g.NLU = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
