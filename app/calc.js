/* Motor de cálculo — consórcio, financiamento e renda fixa.
   Funções puras, sem DOM, para poderem ser testadas em Node. */
(function (g) {
  'use strict';

  const fmt = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (v, d = 2) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';

  // Aceita "28000", "28.000", "28.000,50", "R$ 30.000" e "28 mil".
  function lerValor(txt) {
    let t = String(txt == null ? '' : txt).trim().toLowerCase();
    if (!t) return 0;
    const mil = /mil/.test(t);
    t = t.replace(/[^\d,.]/g, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const v = parseFloat(t) || 0;
    return mil ? v * 1000 : v;
  }

  // Parâmetros padrão por categoria (editáveis na tela).
  const CATEGORIAS = {
    auto:    { nome: 'Auto',    titulo: 'Consórcio Auto',    credito: 180000, prazo: 86,  taxa: 16 },
    pesados: { nome: 'Pesados', titulo: 'Consórcio Pesados', credito: 347287.5, prazo: 140, taxa: 27 },
    imovel:  { nome: 'Imóvel',  titulo: 'Consórcio Imóvel',  credito: 300000, prazo: 180, taxa: 18 },
    moto:    { nome: 'Moto',    titulo: 'Consórcio Moto',    credito: 25000,  prazo: 60,  taxa: 16 }
  };

  /* Consórcio — motor geral de planos.
     Parcela cheia do mês m = fundo comum (crédito/prazo) + taxa de administração (+ fundo de reserva, já dentro da taxa).
     • pctParcela: % do fundo comum pago até a contemplação (100 = integral; 75 = Light; 70 = Renovação 70;
       50 = meia parcela / Renovação 50). baseReducao 'fundo' (padrão: só o fundo comum é reduzido, taxas integrais —
       Ademicon, Disal, Horizon) ou 'total' (a parcela inteira é reduzida — exemplo da Porto Seguro).
       Depois da contemplação a diferença paga a menor (redutor) é rateada nas parcelas restantes.
     • forma: 'linear' (parcela fixa) ou 'degrau' (decrescente: taxa de administração cobrada na 1ª metade do plano e
       nenhuma na 2ª — Rodobens/Canopus). O total do plano é sempre crédito × (1 + taxa).
     • Lance: o percentual abate o saldo devedor na mesma proporção do crédito (crédito + taxas), como no simulador original.
       "No prazo" quita parcelas de trás para frente (ordem inversa); "na parcela" reduz todas as parcelas restantes. */
  function calcConsorcio(d) {
    const credito = +d.credito || 0;
    const prazo = Math.max(parseInt(d.prazo) || 1, 1);
    const taxa = (+d.taxa || 0) / 100;
    const pagas = Math.max(parseInt(d.pagas) || 0, 0);
    const pEf = Math.min(pagas, prazo - 1);
    const pctEmb = +d.pctEmb || 0;
    const pctProp = +d.pctProp || 0;
    const pctTotal = pctEmb + pctProp;
    const pctParcela = Math.min(100, Math.max(5, d.pctParcela == null || d.pctParcela === '' ? 100 : +d.pctParcela));
    const f = pctParcela / 100;
    const forma = d.forma === 'degrau' ? 'degrau' : 'linear';
    const baseReducao = d.baseReducao === 'total' ? 'total' : 'fundo';

    const fc = credito / prazo;
    const metade = Math.ceil(prazo / 2);
    const taxaMes = m => forma === 'degrau' ? (m <= metade ? credito * taxa / metade : 0) : credito * taxa / prazo;
    const cheia = m => fc + taxaMes(m);
    const paga = m => baseReducao === 'fundo' ? fc * f + taxaMes(m) : cheia(m) * f;

    const totalBruto = credito * (1 + taxa);
    let valPagas = 0, redutor = 0;
    for (let m = 1; m <= pEf; m++) { valPagas += paga(m); redutor += cheia(m) - paga(m); }
    const restantes = Math.max(prazo - pEf, 1);
    const depois = m => cheia(m) + redutor / restantes;      // parcela do mês m depois da contemplação, sem lance

    const valEmb = credito * pctEmb / 100;
    const valProp = credito * pctProp / 100;
    const valTotal = valEmb + valProp;
    const creditoPos = credito - valEmb;
    const saldo = Math.max(totalBruto - valPagas, 0);
    const abateEmb = valEmb * (1 + taxa);
    const abateProp = valProp * (1 + taxa);
    const abate = abateEmb + abateProp;
    const saldoPos = Math.max(saldo - abate, 0);

    const parcelaAntes = paga(1);                    // o que o cliente paga até a contemplação
    const parcelaCheia = cheia(1);                   // parcela integral do plano
    const parcelaDepois = depois(pEf + 1);          // 1ª parcela depois da contemplação, sem lance
    const parcelaFinal = depois(prazo);

    // lance diluído NO PRAZO: quita parcelas a partir da última (ordem inversa)
    let sobra = abate, qtdNoPrazo = restantes;
    for (let m = prazo; m > pEf && sobra > 0.005; m--) { const v = depois(m); if (sobra >= v - 0.005) { sobra -= v; qtdNoPrazo--; } else break; }
    qtdNoPrazo = Math.max(qtdNoPrazo, 0);
    // lance diluído NA PARCELA: todas as parcelas restantes diminuem na mesma proporção
    const fator = saldo > 0 ? saldoPos / saldo : 0;
    const parcelaDiluida = parcelaDepois * fator;
    const dentro = pEf + qtdNoPrazo <= prazo && pctTotal < 100;
    const reduzida = pctParcela < 100;

    return { credito, prazo, taxa: taxa * 100, pagas, pctEmb, pctProp, pctTotal, totalBruto,
      parcela: parcelaAntes, parcelaAntes, parcelaCheia, parcelaDepois, parcelaFinal, valorNoPrazo: parcelaDepois,
      pctParcela, forma, baseReducao, reduzida, redutor, parcelaSegundaMetade: cheia(prazo), fundoComumMensal: fc,
      valEmb, valProp, valTotal, creditoPos, restantes, valPagas, saldo, abateEmb, abateProp, saldoPos,
      qtdNoPrazo, parcelaDiluida, dentro };
  }

  // Planos que as administradoras oferecem (pesquisa: Canopus, Rodobens, Ademicon, Disal, Horizon, Porto, Sicredi).
  const PLANOS = {
    integral: { pct: 100, forma: 'linear', nome: 'Parcela integral (linear)' },
    light: { pct: 75, forma: 'linear', nome: 'Plano Light (parcela reduzida em 25%)' },
    r70: { pct: 70, forma: 'linear', nome: 'Renovação 70 (parcela em 70%)' },
    meia: { pct: 50, forma: 'linear', nome: 'Meia parcela / Renovação 50 (parcela em 50%)' },
    degrau: { pct: 100, forma: 'degrau', nome: 'Parcela decrescente (degrau)' }
  };
  function rotuloPlano(pct, forma) {
    pct = Math.round(+pct || 100);
    const base = pct >= 100 ? 'Parcela integral' : pct === 50 ? 'Meia parcela (Renovação 50)' : pct === 70 ? 'Parcela reduzida 70% (Renovação 70)'
      : pct === 75 ? 'Plano Light (parcela reduzida em 25%)' : `Parcela reduzida (${pct}% do fundo comum até a contemplação)`;
    return forma === 'degrau' ? base + ' · decrescente (degrau)' : base + (pct >= 100 ? ' · linear' : '');
  }
  // Explicação curta do plano para a proposta.
  function notaPlano(pct, forma) {
    const n = [];
    if (pct < 100) n.push(`Plano com parcela reduzida: até a contemplação o consorciado paga ${Math.round(pct)}% do fundo comum, mais as taxas. Depois da contemplação, a diferença paga a menor é rateada nas parcelas restantes (a parcela passa a ser a de 100%, acrescida desse rateio).`);
    if (forma === 'degrau') n.push('Plano decrescente (degrau): a taxa de administração é cobrada de forma antecipada na primeira metade do prazo e não é cobrada na segunda metade; por isso as parcelas da segunda metade são menores.');
    if (pct >= 100 && forma !== 'degrau') n.push('Plano de parcela integral (linear): o valor da parcela é o mesmo do início ao fim, antes dos reajustes anuais do crédito.');
    return n;
  }

  /* Financiamento SAC ou Price. valor = bem; entrada abatida; taxa em % a.m. */
  function calcFinanciamento({ valor, entrada = 0, prazo, taxaAm, sistema = 'sac' }) {
    const pv = Math.max((+valor || 0) - (+entrada || 0), 0);
    const n = Math.max(parseInt(prazo) || 1, 1);
    const i = (+taxaAm || 0) / 100;
    let total = 0, primeira = 0, ultima = 0;
    if (sistema === 'price') {
      const pmt = i === 0 ? pv / n : pv * i / (1 - Math.pow(1 + i, -n));
      primeira = ultima = pmt;
      total = pmt * n;
    } else {
      const am = pv / n;
      let saldo = pv;
      for (let k = 1; k <= n; k++) {
        const p = am + saldo * i;
        if (k === 1) primeira = p;
        if (k === n) ultima = p;
        total += p;
        saldo -= am;
      }
    }
    return { pv, n, i: i * 100, sistema, primeira, ultima, total, juros: total - pv };
  }

  // Alíquota regressiva de IR sobre renda fixa, por dias de aplicação.
  const irAliquota = dias => dias <= 180 ? 0.225 : dias <= 360 ? 0.20 : dias <= 720 ? 0.175 : 0.15;

  /* Renda fixa: o cliente aplica todo mês o valor da parcela durante o prazo.
     cdiAa e pctCdi em %. Compara o montante líquido com a carta de crédito. */
  function calcRendaFixa({ aporte, prazo, cdiAa, pctCdi }) {
    const n = Math.max(parseInt(prazo) || 1, 1);
    const aa = (+cdiAa || 0) / 100 * (+pctCdi || 0) / 100;
    const im = Math.pow(1 + aa, 1 / 12) - 1;
    let bruto = 0, liquido = 0;
    for (let k = 1; k <= n; k++) {
      const meses = n - k;                       // aporte feito no fim do mês k
      const vf = aporte * Math.pow(1 + im, meses);
      const ganho = vf - aporte;
      bruto += vf;
      liquido += aporte + ganho * (1 - irAliquota(meses * 30));
    }
    const investido = aporte * n;
    return { n, aporte, taxaAa: aa * 100, taxaAm: im * 100, investido, bruto, liquido, rendimento: liquido - investido };
  }

  const api = { fmt, fmtPct, lerValor, CATEGORIAS, PLANOS, rotuloPlano, notaPlano, calcConsorcio, calcFinanciamento, calcRendaFixa, irAliquota };
  g.Calc = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
