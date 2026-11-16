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

  /* Consórcio: mesma lógica do simulador original.
     O lance abate o saldo devedor na mesma proporção do crédito (crédito + taxas). */
  function calcConsorcio(d) {
    const credito = +d.credito || 0;
    const prazo = Math.max(parseInt(d.prazo) || 1, 1);
    const taxa = (+d.taxa || 0) / 100;
    const pagas = Math.max(parseInt(d.pagas) || 0, 0);
    const pctEmb = +d.pctEmb || 0;
    const pctProp = +d.pctProp || 0;
    const pctTotal = pctEmb + pctProp;

    const totalBruto = credito * (1 + taxa);
    const parcela = totalBruto / prazo;
    const valEmb = credito * pctEmb / 100;
    const valProp = credito * pctProp / 100;
    const valTotal = valEmb + valProp;
    const creditoPos = credito - valEmb;
    const restantes = Math.max(prazo - pagas, 1);

    const valPagas = parcela * pagas;
    const saldo = Math.max(totalBruto - valPagas, 0);
    const abateEmb = valEmb * (1 + taxa);
    const abateProp = valProp * (1 + taxa);
    const saldoPos = Math.max(saldo - abateEmb - abateProp, 0);
    const qtdNoPrazo = Math.ceil(saldoPos / parcela - 1e-9);
    const parcelaDiluida = saldoPos / restantes;
    const dentro = pagas + qtdNoPrazo <= prazo && pctTotal < 100;

    return { credito, prazo, taxa: taxa * 100, pagas, pctEmb, pctProp, pctTotal, totalBruto, parcela,
      valEmb, valProp, valTotal, creditoPos, restantes, valPagas, saldo, abateEmb, abateProp, saldoPos,
      qtdNoPrazo, parcelaDiluida, dentro };
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

  const api = { fmt, fmtPct, lerValor, CATEGORIAS, calcConsorcio, calcFinanciamento, calcRendaFixa, irAliquota };
  g.Calc = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
