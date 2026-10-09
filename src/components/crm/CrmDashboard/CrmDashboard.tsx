"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { EvolucionChart } from "@/components/crm/EvolucionChart/EvolucionChart";
import { ZonaBars } from "@/components/crm/ZonaBars/ZonaBars";
import {
  loadCrm,
  loadCrmCatalogs,
  type CatalogOption,
  type CrmEstado,
  type CrmFilters,
  type CrmSnapshot,
} from "@/lib/crm/query";
import { mapEvolucion, mapResumenKpis, mapZonas } from "@/lib/crm/present";
import {
  formatPeriodLabel,
  parseDateInput,
  PERIOD_OPTIONS,
  rangeForPreset,
  toDateInputValue,
  type DateRange,
  type PeriodPreset,
} from "@/lib/comercial/period";
import styles from "./CrmDashboard.module.css";

const ESTADOS: { id: CrmEstado; label: string }[] = [
  { id: "TODOS", label: "TODOS" },
  { id: "CON", label: "CON" },
  { id: "SIN", label: "SIN" },
];

export function CrmDashboard() {
  const { token } = useAuth();
  const [preset, setPreset] = useState<PeriodPreset>("esteMes");
  const [range, setRange] = useState<DateRange>(() => rangeForPreset("esteMes"));
  const [customDesde, setCustomDesde] = useState(() => toDateInputValue(rangeForPreset("esteMes").desde));
  const [customCorte, setCustomCorte] = useState(() => toDateInputValue(rangeForPreset("esteMes").hasta));
  const [estado, setEstado] = useState<CrmEstado>("TODOS");
  const [codigoZona, setCodigoZona] = useState<number | null>(null);
  const [codigoVendedor, setCodigoVendedor] = useState<number | null>(null);
  const [zonas, setZonas] = useState<CatalogOption[]>([]);
  const [vendedores, setVendedores] = useState<CatalogOption[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [data, setData] = useState<CrmSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (filters: CrmFilters, signal?: AbortSignal) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const snapshot = await loadCrm(filters, token, signal);
        if (signal?.aborted) return;
        setData(snapshot);
        setRange(filters.range);
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
    if (!token) return;
    const controller = new AbortController();
    void load(
      {
        range: rangeForPreset("esteMes"),
        estado: "TODOS",
        codigoZona: null,
        codigoVendedor: null,
      },
      controller.signal,
    );
    return () => controller.abort();
  }, [load, token]);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void loadCrmCatalogs(token, controller.signal)
      .then((catalogs) => {
        if (controller.signal.aborted) return;
        setZonas(catalogs.zonas);
        setVendedores(catalogs.vendedores);
        const messages = [catalogs.errors.zonas, catalogs.errors.vendedores].filter(Boolean);
        setCatalogError(messages.length > 0 ? messages.join(" ") : null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setCatalogError(err instanceof Error ? err.message : "No se pudieron cargar los catálogos.");
      });
    return () => controller.abort();
  }, [token]);

  function currentFilters(patch: Partial<CrmFilters> = {}): CrmFilters {
    return {
      range,
      estado,
      codigoZona,
      codigoVendedor,
      ...patch,
    };
  }

  function applyPreset(next: Exclude<PeriodPreset, "personalizado">) {
    const period = rangeForPreset(next);
    setPreset(next);
    setCustomDesde(toDateInputValue(period.desde));
    setCustomCorte(toDateInputValue(period.hasta));
    void load(currentFilters({ range: period }));
  }

  function applyCustom() {
    const desde = parseDateInput(customDesde);
    const corte = parseDateInput(customCorte);
    if (!desde || !corte) {
      setError("Indicá un rango de fechas válido.");
      return;
    }
    if (desde > corte) {
      setError("La fecha desde no puede ser posterior a la fecha corte.");
      return;
    }
    setPreset("personalizado");
    void load(currentFilters({ range: { desde, hasta: corte } }));
  }

  const kpis = mapResumenKpis(data?.resumen ?? null);
  const toneClass = {
    total: styles.total,
    facturada: styles.facturada,
    pedidos: styles.pedidos,
    clientes: styles.clientes,
  };
  const evolucion = mapEvolucion(data?.evolucion ?? []);
  const zonasVenta = mapZonas(data?.zonas ?? []);

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
              <span className={styles.fieldLabel}>Fecha desde</span>
              <input
                type="date"
                className={styles.control}
                value={customDesde}
                onChange={(event) => setCustomDesde(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Fecha corte</span>
              <input
                type="date"
                className={styles.control}
                value={customCorte}
                onChange={(event) => setCustomCorte(event.target.value)}
              />
            </label>
          </div>
        ) : null}

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Estado</span>
          <select
            className={styles.control}
            value={estado}
            onChange={(event) => {
              const next = event.target.value as CrmEstado;
              setEstado(next);
              void load(currentFilters({ estado: next }));
            }}
          >
            {ESTADOS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Zona</span>
          <select
            className={styles.control}
            value={codigoZona ?? ""}
            onChange={(event) => {
              const next = event.target.value === "" ? null : Number(event.target.value);
              setCodigoZona(next);
              void load(currentFilters({ codigoZona: next }));
            }}
          >
            <option value="">Todas las zonas</option>
            {zonas.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Vendedor</span>
          <select
            className={styles.control}
            value={codigoVendedor ?? ""}
            onChange={(event) => {
              const next = event.target.value === "" ? null : Number(event.target.value);
              setCodigoVendedor(next);
              void load(currentFilters({ codigoVendedor: next }));
            }}
          >
            <option value="">Todos</option>
            {vendedores.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className={styles.refresh}
          onClick={() => {
            if (preset === "personalizado") applyCustom();
            else void load(currentFilters());
          }}
        >
          Actualizar
        </button>
      </div>

      <p className={styles.context}>
        Período {formatPeriodLabel(range)}
        {loading ? " · Actualizando…" : ""}
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}
      {catalogError ? <p className={styles.error}>{catalogError}</p> : null}
      {data?.errors.resumen ? <p className={styles.error}>{data.errors.resumen}</p> : null}

      <div className={styles.kpis}>
        {kpis.map((kpi) => (
          <article key={kpi.id} className={`${styles.card} ${toneClass[kpi.tone]}`}>
            <h2 className={styles.cardLabel}>{kpi.label}</h2>
            <p className={styles.cardValue}>{loading && !data ? "…" : kpi.value}</p>
            {kpi.foot ? <p className={styles.cardFoot}>{kpi.foot}</p> : null}
          </article>
        ))}
      </div>

      <div className={styles.panels}>
        <article className={styles.panel}>
          <h2 className={styles.panelTitle}>Evolución de la venta comercial</h2>
          {data?.errors.evolucion ? (
            <p className={styles.empty}>{data.errors.evolucion}</p>
          ) : evolucion.length === 0 ? (
            <p className={styles.empty}>{loading ? "Cargando…" : "Sin datos para este período."}</p>
          ) : (
            <EvolucionChart points={evolucion} />
          )}
        </article>

        <article className={styles.panel}>
          <h2 className={styles.panelTitle}>Venta por zona</h2>
          {data?.errors.zonas ? (
            <p className={styles.empty}>{data.errors.zonas}</p>
          ) : zonasVenta.length === 0 ? (
            <p className={styles.empty}>{loading ? "Cargando…" : "Sin datos para este período."}</p>
          ) : (
            <ZonaBars items={zonasVenta} />
          )}
        </article>
      </div>
    </section>
  );
}
