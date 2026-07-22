import { useState, useEffect, useRef } from "react";

const DIA_LABELS = ["SEG", "TER", "QUA", "QUI", "SEX"];
const DIAS_SEMANA = 5;
const SAQUE_PERCENT = 0.3;
const SEMANAS = 18; // 90 dias
const ENTRIES_PER_DAY = 4;

const TIERS = [
  { semanas: 6, taxa: 0.06, label: "Mês 1", cor: "#2E86AB", fundo: "#DCEAF0" },
  { semanas: 6, taxa: 0.05, label: "Mês 2", cor: "#4C8C5C", fundo: "#DFEEE1" },
  { semanas: 6, taxa: 0.04, label: "Mês 3", cor: "#B5722F", fundo: "#F3E4D2" },
];

function taxaDaSemana(idx) {
  let acc = 0;
  for (const t of TIERS) {
    if (idx < acc + t.semanas) return t;
    acc += t.semanas;
  }
  return TIERS[TIERS.length - 1];
}

function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d) {
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function parseISODate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function dayKey(w, d) {
  return `${w}-${d}`;
}

function computeAll(capitalInicial, dataInicio, entriesMap) {
  const weeks = [];
  let inicial = capitalInicial;
  let dayCounter = 0;
  for (let w = 0; w < SEMANAS; w++) {
    const tier = taxaDaSemana(w);
    let v = inicial;
    const dias = [];
    for (let d = 0; d < DIAS_SEMANA; d++) {
      const valorBase = v;
      const meta = valorBase * tier.taxa;
      const date = new Date(dataInicio);
      date.setDate(date.getDate() + dayCounter);
      const key = dayKey(w, d);
      const rawEntries = entriesMap[key] || ["", "", "", ""];
      const nums = rawEntries.map((e) => (e === "" || e === null || e === undefined ? null : Number(e)));
      const hasAny = nums.some((n) => n !== null && !isNaN(n));
      const soma = nums.reduce((s, n) => s + (n !== null && !isNaN(n) ? n : 0), 0);
      dias.push({
        label: DIA_LABELS[d],
        date,
        valorBase,
        meta,
        entries: rawEntries,
        temEntradas: hasAny,
        somaReal: soma,
      });
      v = hasAny ? valorBase + soma : valorBase * (1 + tier.taxa);
      dayCounter++;
    }
    const totalLucro = dias.reduce((s, x) => s + (x.temEntradas ? x.somaReal : x.meta), 0);
    const valorFinal = v;
    const saque = totalLucro * SAQUE_PERCENT;
    const proximoInicial = valorFinal - saque;
    weeks.push({ semana: w + 1, tier, inicial, dias, totalLucro, valorFinal, saque, proximoInicial });
    inicial = proximoInicial;
  }
  return weeks;
}

export default function GestorDeBanca() {
  const [capitalInicial, setCapitalInicial] = useState(200);
  const [inputValue, setInputValue] = useState("200");
  const [dataInicio, setDataInicio] = useState(new Date());
  const [entriesMap, setEntriesMap] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [savedPulse, setSavedPulse] = useState(false);
  const [expandedWeek, setExpandedWeek] = useState(null);
  const [expandedDay, setExpandedDay] = useState(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const c = await window.storage.get("banca:capitalInicial");
        if (c && c.value) {
          const v = JSON.parse(c.value);
          setCapitalInicial(v);
          setInputValue(String(v));
        }
      } catch (e) {}
      try {
        const dt = await window.storage.get("banca:dataInicio");
        if (dt && dt.value) setDataInicio(parseISODate(JSON.parse(dt.value)));
      } catch (e) {}
      try {
        const en = await window.storage.get("banca:entradas");
        if (en && en.value) setEntriesMap(JSON.parse(en.value));
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await window.storage.set("banca:capitalInicial", JSON.stringify(capitalInicial));
        await window.storage.set("banca:dataInicio", JSON.stringify(toISODate(dataInicio)));
        await window.storage.set("banca:entradas", JSON.stringify(entriesMap));
        setSavedPulse(true);
        setTimeout(() => setSavedPulse(false), 800);
      } catch (e) {
        console.error(e);
      }
    }, 350);
  }, [capitalInicial, dataInicio, entriesMap, loaded]);

  function handleInputChange(e) {
    const raw = e.target.value;
    setInputValue(raw);
    const n = Number(raw.replace(",", "."));
    if (!isNaN(n) && n > 0) setCapitalInicial(n);
  }

  function handleDateChange(e) {
    if (e.target.value) setDataInicio(parseISODate(e.target.value));
  }

  function setEntry(w, d, entryIdx, value) {
    const key = dayKey(w, d);
    setEntriesMap((prev) => {
      const current = prev[key] ? prev[key].slice() : ["", "", "", ""];
      current[entryIdx] = value;
      return { ...prev, [key]: current };
    });
  }

  const weeks = computeAll(capitalInicial, dataInicio, entriesMap);
  const weeksProjetado = computeAll(capitalInicial, dataInicio, {});
  const bancaFinal = weeks.length ? weeks[weeks.length - 1].proximoInicial : capitalInicial;
  const bancaFinalProjetada = weeksProjetado.length ? weeksProjetado[weeksProjetado.length - 1].proximoInicial : capitalInicial;
  const deltaFinal = bancaFinal - bancaFinalProjetada;
  const totalSacado = weeks.reduce((s, w) => s + w.saque, 0);
  const lucroTotal = bancaFinal + totalSacado - capitalInicial;
  const dataFinal = weeks[weeks.length - 1]?.dias[4]?.date;
  const algumLancamento = weeks.some((w) => w.dias.some((d) => d.temEntradas));

  const monthSummaries = TIERS.map((tier, i) => {
    const startIdx = i * 6;
    const endIdx = startIdx + 6;
    const weeksInMonth = weeks.slice(startIdx, endIdx);
    const inicioMes = weeksInMonth[0]?.inicial ?? 0;
    const fimMes = weeksInMonth[weeksInMonth.length - 1]?.proximoInicial ?? 0;
    const sacadoMes = weeksInMonth.reduce((s, w) => s + w.saque, 0);
    return { ...tier, inicioMes, fimMes, sacadoMes };
  });

  return (
    <div className="min-h-screen ledger-bg">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');
        .ledger-bg {
          background: #10231a;
          background-image:
            radial-gradient(circle at 20% 10%, rgba(198,161,91,0.06), transparent 40%),
            radial-gradient(circle at 80% 60%, rgba(198,161,91,0.04), transparent 45%);
          font-family: 'Inter', sans-serif;
        }
        .font-display { font-family: 'Fraunces', serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
        .page {
          background: #f4efe2;
          border: 1px solid #d8cfb8;
          box-shadow: 0 18px 40px -20px rgba(0,0,0,0.5);
        }
        .tick { transition: color 0.4s ease; }
        input.capital-input, input.date-input {
          font-family: 'Fraunces', serif;
          font-weight: 700;
        }
        .week-row, .day-row { cursor: pointer; }
        .week-row:hover, .day-row:hover { background: #ece4d0; }
        .entry-input {
          width: 100%;
          background: #fffdf8;
          border: 1px solid #d8cfb8;
          border-radius: 4px;
          padding: 3px 6px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          color: #1b2e22;
        }
        .day-badge {
          font-size: 9px;
          padding: 1px 6px;
          border-radius: 999px;
          font-family: 'IBM Plex Mono', monospace;
        }
        @media (prefers-reduced-motion: reduce) { .tick { transition: none; } }
      `}</style>

      <div className="max-w-3xl mx-auto px-5 py-10">
        <div className="flex items-baseline justify-between mb-1">
          <h1 className="font-display text-4xl text-[#f4efe2] tracking-tight">Gestor de Banca</h1>
          <span className={`font-mono text-xs text-[#c6a15b] transition-opacity duration-500 ${savedPulse ? "opacity-100" : "opacity-0"}`}>
            salvo
          </span>
        </div>
        <p className="text-[#b9c4b4] text-sm mb-8">
          Defina capital e data de início — os 90 dias se desenham sozinhos. Lance seus resultados do dia a dia.
        </p>

        {/* Capital + Date inputs */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="page rounded-md px-5 py-4">
            <label className="text-[10px] uppercase tracking-widest text-[#8a8168] font-mono mb-2 block">
              Capital inicial
            </label>
            <div className="flex items-center gap-1">
              <span className="font-display text-xl text-[#1b2e22]">R$</span>
              <input
                type="text"
                inputMode="decimal"
                value={inputValue}
                onChange={handleInputChange}
                className="capital-input text-xl text-[#1b2e22] bg-transparent border-b-2 border-[#c6a15b] focus:outline-none w-full"
              />
            </div>
          </div>
          <div className="page rounded-md px-5 py-4">
            <label className="text-[10px] uppercase tracking-widest text-[#8a8168] font-mono mb-2 block">
              Data de início
            </label>
            <input
              type="date"
              value={toISODate(dataInicio)}
              onChange={handleDateChange}
              className="date-input text-lg text-[#1b2e22] bg-transparent border-b-2 border-[#c6a15b] focus:outline-none w-full"
            />
          </div>
        </div>

        <p className="font-mono text-xs text-[#b9c4b4] mb-8">
          período: {fmtDate(dataInicio)} até {fmtDate(dataFinal)}
        </p>

        {/* Result stats */}
        <div className={`grid gap-3 mb-8 ${algumLancamento ? "grid-cols-2" : "grid-cols-3"}`}>
          <div className="page rounded-md px-4 py-4">
            <div className="text-[10px] uppercase tracking-widest text-[#8a8168] font-mono mb-1">Banca final (90d)</div>
            <div className="font-display text-xl text-[#1b2e22] tick">{fmt(bancaFinal)}</div>
          </div>
          <div className="page rounded-md px-4 py-4">
            <div className="text-[10px] uppercase tracking-widest text-[#8a8168] font-mono mb-1">Total sacado</div>
            <div className="font-display text-xl text-[#a6432d] tick">{fmt(totalSacado)}</div>
          </div>
          {!algumLancamento && (
            <div className="page rounded-md px-4 py-4">
              <div className="text-[10px] uppercase tracking-widest text-[#8a8168] font-mono mb-1">Lucro total</div>
              <div className="font-display text-xl text-[#4c8c5c] tick">{fmt(lucroTotal)}</div>
            </div>
          )}
          {algumLancamento && (
            <div className="page rounded-md px-4 py-4 col-span-2" style={{ borderLeft: `4px solid ${deltaFinal >= 0 ? "#4C8C5C" : "#A6432D"}` }}>
              <div className="text-[10px] uppercase tracking-widest text-[#8a8168] font-mono mb-1">Real vs. projeção (sem lançamentos)</div>
              <div className="font-mono text-sm text-[#1b2e22]">
                <span className="font-display text-lg">{fmt(bancaFinal)}</span>
                <span className="text-[#8a8168]"> vs {fmt(bancaFinalProjetada)} projetado</span>
              </div>
              <div className={`font-mono text-xs mt-1 font-semibold`} style={{ color: deltaFinal >= 0 ? "#4C8C5C" : "#A6432D" }}>
                {deltaFinal >= 0 ? "▲ +" : "▼ "}{fmt(Math.abs(deltaFinal))} {deltaFinal >= 0 ? "acima" : "abaixo"} da meta original
              </div>
            </div>
          )}
        </div>

        {/* Month summary cards */}
        <div className="space-y-3 mb-8">
          {monthSummaries.map((m, i) => (
            <div key={i} className="page rounded-md p-5 flex items-center justify-between" style={{ borderLeft: `5px solid ${m.cor}` }}>
              <div>
                <div className="font-display text-lg text-[#1b2e22]">{m.label}</div>
                <div className="font-mono text-xs text-[#8a8168]">taxa {Math.round(m.taxa * 100)}% ao dia · semanas {i * 6 + 1}–{i * 6 + 6}</div>
              </div>
              <div className="text-right font-mono text-sm">
                <div className="text-[#1b2e22]">{fmt(m.inicioMes)} → <span className="font-semibold">{fmt(m.fimMes)}</span></div>
                <div className="text-[#a6432d] text-xs mt-0.5">sacado: {fmt(m.sacadoMes)}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Weekly / daily breakdown */}
        <div className="page rounded-md p-6">
          <div className="font-display text-lg text-[#1b2e22] mb-1">Detalhamento e lançamentos</div>
          <div className="font-mono text-[11px] text-[#8a8168] mb-4">toque numa semana, depois num dia, pra lançar seus resultados</div>
          <div className="space-y-1">
            {weeks.map((week, wIdx) => {
              const deltaSemana = week.proximoInicial - weeksProjetado[wIdx].proximoInicial;
              const temDelta = Math.abs(deltaSemana) > 0.005;
              return (
              <div key={wIdx} style={temDelta ? { background: deltaSemana >= 0 ? "#F2F8F1" : "#FBF1EE", borderRadius: 6 } : undefined}>
                <div
                  className="week-row grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center px-2 py-2 rounded font-mono text-sm"
                  onClick={() => setExpandedWeek(expandedWeek === wIdx ? null : wIdx)}
                >
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: week.tier.cor }} />
                  <span className="text-[#1b2e22]">
                    Semana {week.semana} <span className="text-[#8a8168] text-xs">({fmtDate(week.dias[0].date)}–{fmtDate(week.dias[4].date)})</span>
                    {temDelta && (
                      <span className="ml-2 day-badge" style={{ background: deltaSemana >= 0 ? "#DFEEE1" : "#F3D8D2", color: deltaSemana >= 0 ? "#4C8C5C" : "#A6432D" }}>
                        {deltaSemana >= 0 ? "+" : "−"}{fmt(Math.abs(deltaSemana))} vs meta
                      </span>
                    )}
                  </span>
                  <span className="text-[#8a8168] text-xs">{fmt(week.inicial)} → {fmt(week.proximoInicial)}</span>
                  <span className="text-[#a6432d] text-xs">−{fmt(week.saque)}</span>
                </div>

                {expandedWeek === wIdx && (
                  <div className="ml-5 mb-2 pl-4 border-l-2 space-y-1 py-2" style={{ borderColor: week.tier.fundo }}>
                    {week.dias.map((d, dIdx) => (
                      <div key={dIdx}>
                        <div
                          className="day-row flex items-center justify-between px-2 py-1.5 rounded font-mono text-xs"
                          onClick={() => setExpandedDay(expandedDay === `${wIdx}-${dIdx}` ? null : `${wIdx}-${dIdx}`)}
                        >
                          <span className="text-[#1b2e22] w-24">{d.label} · {fmtDate(d.date)}</span>
                          <span className="text-[#8a8168]">meta: {fmt(d.meta)}</span>
                          {d.temEntradas ? (
                            <span
                              className="day-badge"
                              style={{
                                background: d.somaReal >= d.meta ? "#DFEEE1" : "#F3D8D2",
                                color: d.somaReal >= d.meta ? "#4C8C5C" : "#A6432D",
                              }}
                            >
                              real: {fmt(d.somaReal)}
                            </span>
                          ) : (
                            <span className="day-badge bg-[#eee] text-[#8a8168]">sem lançamento</span>
                          )}
                        </div>

                        {expandedDay === `${wIdx}-${dIdx}` && (
                          <div className="ml-4 mt-1 mb-2 grid grid-cols-2 gap-2">
                            {Array.from({ length: ENTRIES_PER_DAY }).map((_, eIdx) => (
                              <input
                                key={eIdx}
                                type="number"
                                placeholder={`entrada ${eIdx + 1}`}
                                value={(entriesMap[dayKey(wIdx, dIdx)] || ["", "", "", ""])[eIdx]}
                                onChange={(ev) => setEntry(wIdx, dIdx, eIdx, ev.target.value)}
                                className="entry-input"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="flex justify-between font-mono text-xs text-[#1b2e22] pt-1 border-t border-[#d8cfb8] mt-1">
                      <span>lucro semanal: {fmt(week.totalLucro)}</span>
                      <span>saque (30%): {fmt(week.saque)}</span>
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>

        <p className="text-center text-[#8a8168] text-xs font-mono mt-6">
          6% ao dia (mês 1) · 5% ao dia (mês 2) · 4% ao dia (mês 3) · saque de 30% do lucro toda semana
        </p>
      </div>
    </div>
  );
}
