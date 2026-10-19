"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { MediosPagoChart } from "@/components/comercial/MediosPagoChart/MediosPagoChart";
import { SucursalBars } from "@/components/comercial/SucursalBars/SucursalBars";
import { KpiCard, KpiGrid, KpiSection, kpiDeltaClass } from "@/components/ui";
import { loadComercial, type ComercialSnapshot } from "@/lib/comercial/query";
import {
  formatPeriodLabel,
  parseDateInput,
  PERIOD_OPTIONS,
  rangeForPreset,
  toDateInputValue,
  type DateRange,
  type PeriodPreset,
} from "@/lib/comercial/period";
import {
  mapMediosPago,
  mapRubros,
  mapSucursales,
  mapVentasKpis,
  formatMoney,
  pickField,
  NO_PREVIOUS,
  type KpiCardData,
} from "@/lib/comercial/present";
import styles from "./ComercialDashboard.module.css";

function kpiFoot(kpi: KpiCardData, showFoot: boolean) {
  if (!showFoot) return undefined;
  return (
    <>
      <span>{kpi.caption}</span>
      {kpi.delta ? (
        <>
          {" · "}
          <span className={kpiDeltaClass[kpi.delta.tone]}>{kpi.delta.text}</span>
          {" vs. período comparable anterior"}
        </>
      ) : (
        ` · ${NO_PREVIOUS}`
      )}
    </>
  );
}

export function ComercialDashboard() {
  const { token } = useAuth();
  const [preset, setPreset] = useState<PeriodPreset>("esteMes");
  const [range, setRange] = useState<DateRange>(() => rangeForPreset("esteMes"));
  const [customDesde, setCustomDesde] = useState(() => toDateInputValue(rangeForPreset("esteMes").desde));
  const [customHasta, setCustomHasta] = useState(() => toDateInputValue(rangeForPreset("esteMes").hasta));
  const [data, setData] = useState<ComercialSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (next: DateRange, nextPreset: PeriodPreset, signal?: AbortSignal) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const snapshot = await loadComercial(next, nextPreset, token, signal);
        if (signal?.aborted) return;
        setData(snapshot);
        setRange(next);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : "No se pudieron cargar los indicadores.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    const initial = rangeForPreset("esteMes");
    const controller = new AbortController();
    void load(initial, "esteMes", controller.signal);
    return () => controller.abort();
  }, [load]);

  function applyPreset(next: Exclude<PeriodPreset, "personalizado">) {
    const period = rangeForPreset(next);
    setPreset(next);
    setCustomDesde(toDateInputValue(period.desde));
    setCustomHasta(toDateInputValue(period.hasta));
    void load(period, next);
  }

  function applyCustom() {
    const desde = parseDateInput(customDesde);
    const hasta = parseDateInput(customHasta);
    if (!desde || !hasta) {
      setError("Indicá un rango de fechas válido.");
      return;
    }
    if (desde > hasta) {
      setError("La fecha desde no puede ser posterior a la fecha hasta.");
      return;
    }
    setPreset("personalizado");
    void load({ desde, hasta }, "personalizado");
  }

  const kpis = mapVentasKpis(data?.ventas ?? null, data?.ventasAnterior ?? null);
  const topKpis = kpis.slice(0, 3);
  const opsKpis = kpis.slice(3);
  const medios = mapMediosPago(data?.medios ?? []);
  const sucursales = mapSucursales(data?.sucursales ?? []);
  const rubros = mapRubros(data?.rubros ?? []);
  const showFoot = Boolean(data);
  const kpiLoading = loading && !data;

  return (
    <section className={styles.page}>
      <div className={styles.filters}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Período</span>
          <div className={styles.pills} role="group" aria-label="Período">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={preset === option.id ? styles.pillOn : styles.pill}
                onClick={() => applyPreset(option.id)}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              className={preset === "personalizado" ? styles.pillOn : styles.pill}
              onClick={() => setPreset("personalizado")}
            >
              Personalizado
            </button>
          </div>
        </div>

        {preset === "personalizado" ? (
          <div className={styles.custom}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Desde</span>
              <input
                type="date"
                className={styles.date}
                value={customDesde}
                onChange={(event) => setCustomDesde(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Hasta</span>
              <input
                type="date"
                className={styles.date}
                value={customHasta}
                onChange={(event) => setCustomHasta(event.target.value)}
              />
            </label>
          </div>
        ) : null}

        <button type="button" className={styles.refresh} onClick={() => {
          if (preset === "personalizado") applyCustom();
          else void load(range, preset);
        }}>
          Actualizar
        </button>
      </div>

      <p className={styles.context}>
        Período {formatPeriodLabel(range)}
        {loading ? " · Actualizando…" : ""}
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}
      {data?.errors.ventas ? <p className={styles.error}>{data.errors.ventas}</p> : null}

      <KpiGrid columns={3}>
        {topKpis.map((kpi) => (
          <KpiCard
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            valueTone={kpi.valueTone}
            foot={kpiFoot(kpi, showFoot)}
            loading={kpiLoading}
          />
        ))}
      </KpiGrid>

      <KpiSection title="Operaciones">
        <KpiGrid columns={4}>
          {opsKpis.map((kpi) => (
            <KpiCard
              key={kpi.id}
              label={kpi.label}
              value={kpi.value}
              size="sm"
              foot={kpiFoot(kpi, showFoot)}
              loading={kpiLoading}
            />
          ))}
        </KpiGrid>
      </KpiSection>

      <div className={styles.panels}>
        <article className={styles.panel}>
          <h2 className={styles.panelTitle}>Ventas por Sucursal</h2>
          {data?.errors.sucursales ? (
            <p className={styles.empty}>{data.errors.sucursales}</p>
          ) : sucursales.length === 0 ? (
            <p className={styles.empty}>{loading ? "Cargando…" : "Sin datos para este período."}</p>
          ) : (
            <SucursalBars items={sucursales} />
          )}
        </article>

        <article className={styles.panel}>
          <h2 className={styles.panelTitle}>Ventas por Rubro · Top 5 por Venta Neta</h2>
          {data?.errors.rubros ? (
            <p className={styles.empty}>{data.errors.rubros}</p>
          ) : rubros.length === 0 ? (
            <p className={styles.empty}>{loading ? "Cargando…" : "Sin datos para este período."}</p>
          ) : (
            <SucursalBars items={rubros} />
          )}
        </article>
      </div>

      <div className={styles.panels}>
        <article className={styles.panel}>
          <h2 className={styles.panelTitle}>Ventas por Medios de Pago</h2>
          {data?.errors.medios ? (
            <p className={styles.empty}>{data.errors.medios}</p>
          ) : medios.length === 0 ? (
            <p className={styles.empty}>{loading ? "Cargando…" : "Sin datos para este período."}</p>
          ) : (
            <MediosPagoChart items={medios} />
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Distribución de la Venta</h2>
            <span className={styles.panelAside}>Resumen comercial</span>
          </div>
          {data?.errors.ventas ? (
            <p className={styles.empty}>{data.errors.ventas}</p>
          ) : (
            <div className={styles.distribucion}>
              <article className={styles.distCard}>
                <span>Venta Neta</span>
                <strong className={styles.distNeta}>
                  {formatMoney(pickField(data?.ventas, "VentasNetas"))}
                </strong>
                <small>Sin impuestos</small>
              </article>
              <article className={styles.distCard}>
                <span>IVA</span>
                <strong className={styles.distIva}>{formatMoney(pickField(data?.ventas, "IVA"))}</strong>
                <small>Componente de la venta</small>
              </article>
              <article className={styles.distCard}>
                <span>Percepciones</span>
                <strong className={styles.distPercepciones}>
                  {formatMoney(pickField(data?.ventas, "Percepciones"))}
                </strong>
                <small>Componente de la venta</small>
              </article>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
