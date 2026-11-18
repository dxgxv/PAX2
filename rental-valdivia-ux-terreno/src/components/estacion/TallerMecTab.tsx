import React, { useState, useEffect, useMemo } from "react";
import {
  PANAS_POR_CATEGORIA,
  PAUTAS_MECANICAS,
  OT_ESTADOS_ABIERTOS,
  ESTADO_EN_PANA,
  ESTADO_EN_PRESUPUESTO,
  formatCLP,
  duracionLegible,
  type Equipo,
  type OrdenTrabajo,
  type Repuesto,
  type OTRepuestoItem,
} from "../../data/catalogs";
import { apiRequest, submitFieldMutation } from "../../lib/apiClient";
import {
  loadOperadorPerfil,
  saveOperadorPerfil,
} from "../../lib/operadorPerfil";
import type { InformePdfTarget } from "../InformePdfModal";
import {
  Wrench,
  CheckCircle2,
  Cpu,
  ChevronDown,
  ChevronUp,
  Package,
  Plus,
  FileText,
  CheckSquare,
  Printer,
  Undo2,
} from "lucide-react";

interface TallerMecTabProps {
  maq: Equipo;
  ordenesTrabajo: OrdenTrabajo[];
  repuestos: Repuesto[];
  otRepuestos: OTRepuestoItem[];
  onOpenPdf: (target: InformePdfTarget) => void;
  onRefresh: (flashMsg?: {
    type: "success" | "warning" | "error";
    text: string;
  }) => Promise<void>;
}

export default function TallerMecTab({
  maq,
  ordenesTrabajo,
  repuestos,
  otRepuestos,
  onOpenPdf,
  onRefresh,
}: TallerMecTabProps) {
  const [submitting, setSubmitting] = useState(false);
  const [tipoNuevaOt, setTipoNuevaOt] = useState<"CORRECTIVA" | "PREVENTIVA">(
    "CORRECTIVA"
  );
  const [nuevoEstadoOt, setNuevoEstadoOt] = useState<string>("ABIERTA");
  const [repSelId, setRepSelId] = useState<number>(0);
  const [cantRepSel, setCantRepSel] = useState<number>(1);
  const [diagExpanded, setDiagExpanded] = useState<boolean>(false);
  const [panasTallerMarcadas, setPanasTallerMarcadas] = useState<string[]>([]);
  const [otraPanaTaller, setOtraPanaTaller] = useState<string>("");
  const [tareasPautaMarcadas, setTareasPautaMarcadas] = useState<string[]>([]);
  const [mecanicoNom, setMecanicoNom] = useState<string>(
    () => loadOperadorPerfil().nombre
  );
  const [costoRepExterno, setCostoRepExterno] = useState<number>(0);
  const [detalleOtTrabajo, setDetalleOtTrabajo] = useState<string>("");

  const [consultaIa, setConsultaIa] = useState<string>("");
  const [loadingIa, setLoadingIa] = useState<boolean>(false);
  const [respuestaIa, setRespuestaIa] = useState<string>("");
  const [errorIa, setErrorIa] = useState<string>("");

  const otActual = useMemo(() => {
    return ordenesTrabajo.find(
      (o) => o.codigo_equipo === maq.codigo && o.estado !== "CERRADA"
    );
  }, [ordenesTrabajo, maq.codigo]);

  useEffect(() => {
    if (otActual) {
      setNuevoEstadoOt(otActual.estado);
    }
  }, [otActual]);

  const repuestosOrdenados = useMemo(() => {
    const relevantes = repuestos.filter(
      (r) => r.aplica_a === maq.categoria || r.aplica_a === "General"
    );
    const otros = repuestos.filter(
      (r) => r.aplica_a !== maq.categoria && r.aplica_a !== "General"
    );
    return [...relevantes, ...otros];
  }, [repuestos, maq.categoria]);

  useEffect(() => {
    if (repuestosOrdenados.length > 0 && !repSelId) {
      setRepSelId(repuestosOrdenados[0].id);
    }
  }, [repuestosOrdenados, repSelId]);

  useEffect(() => {
    const tienePana =
      Number(maq.falla_activa) === 1 || maq.estado_operativo === ESTADO_EN_PANA;
    setTipoNuevaOt(tienePana ? "CORRECTIVA" : "PREVENTIVA");

    const panasGuardadas = maq.panas_reportadas
      .split("|")
      .map((p) => p.trim())
      .filter(Boolean);
    const catList = PANAS_POR_CATEGORIA[maq.categoria] || [];
    setPanasTallerMarcadas(panasGuardadas.filter((p) => catList.includes(p)));
    const otrasGuardadas = panasGuardadas
      .filter(
        (p) =>
          (p.startsWith("Otra pana:") || p.startsWith("Otra:")) &&
          p.includes(":")
      )
      .map((p) => p.split(":", 2)[1].trim());
    setOtraPanaTaller(otrasGuardadas.join(", "));
    setDiagExpanded(Boolean(maq.panas_reportadas.trim()));
    setTareasPautaMarcadas([]);
    setMecanicoNom(loadOperadorPerfil().nombre);
    setCostoRepExterno(0);
    setDetalleOtTrabajo("");
    setRespuestaIa("");
    setErrorIa("");
    setConsultaIa("");
  }, [
    maq.codigo,
    maq.fecha_actualizacion,
    maq.estado_operativo,
    maq.panas_reportadas,
    maq.falla_activa,
    maq.categoria,
  ]);

  const catMaq = maq.categoria;
  const listaPanasCat =
    PANAS_POR_CATEGORIA[catMaq] ||
    PANAS_POR_CATEGORIA["Maquinaria con Horómetro"];
  const pautaActual =
    PAUTAS_MECANICAS[catMaq] || PAUTAS_MECANICAS["Maquinaria con Horómetro"];

  const tienePanaTaller =
    Number(maq.falla_activa) === 1 || maq.estado_operativo === ESTADO_EN_PANA;
  const esperaPresupuestoTaller =
    maq.estado_operativo === ESTADO_EN_PRESUPUESTO;
  const pautaCompleta = tareasPautaMarcadas.length === pautaActual.length;

  const repuestosDeEstaOt = otActual
    ? otRepuestos.filter((r) => r.ot_id === otActual.id)
    : [];
  const totalRepuestosOt = repuestosDeEstaOt.reduce(
    (acc, r) => acc + r.subtotal,
    0
  );

  const handleAbrirOt = async () => {
    setSubmitting(true);
    try {
      const res = await apiRequest(
        `/api/equipos/${encodeURIComponent(maq.codigo)}/ot/abrir`,
        {
          method: "POST",
          body: JSON.stringify({ tipo: tipoNuevaOt }),
        }
      );
      if (!res.ok) {
        await onRefresh({
          type: "error",
          text: res.data.error || "Error al abrir OT.",
        });
      } else {
        await onRefresh({
          type: "success",
          text: res.data.message || "Orden de trabajo abierta.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleActualizarEstadoOt = async (estadoOverride?: string) => {
    if (!otActual) return;
    const targetEstado = estadoOverride || nuevoEstadoOt;
    if (targetEstado === otActual.estado) return;
    setNuevoEstadoOt(targetEstado);
    setSubmitting(true);
    try {
      const res = await apiRequest(`/api/ot/${otActual.id}/estado`, {
        method: "POST",
        body: JSON.stringify({ nuevo_estado: targetEstado }),
      });
      if (!res.ok) {
        await onRefresh({
          type: "error",
          text: res.data.error || "Error al actualizar estado de OT.",
        });
      } else {
        await onRefresh({
          type: "success",
          text: res.data.message || "Estado de OT actualizado.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAgregarRepuestoOt = async () => {
    if (!otActual || !repSelId) return;
    setSubmitting(true);
    try {
      const res = await apiRequest<{ bajoMinimo?: boolean }>(
        `/api/ot/${otActual.id}/repuesto`,
        {
          method: "POST",
          body: JSON.stringify({
            repuesto_id: repSelId,
            cantidad: cantRepSel,
          }),
        }
      );
      if (!res.ok) {
        await onRefresh({
          type: "error",
          text: res.data.error || "Error al agregar repuesto.",
        });
      } else {
        await onRefresh({
          type: res.data.bajoMinimo ? "warning" : "success",
          text: res.data.message || "Repuesto imputado a la OT.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevertirRepuestoOt = async (itemId: number, nombreRep?: string) => {
    if (!otActual) return;
    if (
      !window.confirm(
        `¿Devolver ${nombreRep ? `"${nombreRep}"` : "este repuesto"} a bodega y descontarlo de la OT ${otActual.folio}?`
      )
    ) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiRequest(
        `/api/ot/${otActual.id}/repuesto/${itemId}/revertir`,
        { method: "POST" }
      );
      if (!res.ok) {
        await onRefresh({
          type: "error",
          text: res.data.error || "No se pudo revertir el repuesto.",
        });
      } else {
        await onRefresh({
          type: "success",
          text: res.data.message || "Stock devuelto a bodega.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleActualizarDiagnostico = async () => {
    setSubmitting(true);
    try {
      const res = await apiRequest(
        `/api/equipos/${encodeURIComponent(maq.codigo)}/diagnostico`,
        {
          method: "POST",
          body: JSON.stringify({
            panas_taller: panasTallerMarcadas,
            otra_pana_taller: otraPanaTaller,
          }),
        }
      );
      if (!res.ok) {
        await onRefresh({
          type: "error",
          text: res.data.error || "Error al actualizar diagnóstico.",
        });
      } else {
        await onRefresh({
          type: "success",
          text: res.data.message || "Diagnóstico actualizado.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const persistMecanicoNombre = (nom: string) => {
    const clean = nom.trim();
    if (!clean) return;
    const current = loadOperadorPerfil();
    saveOperadorPerfil({
      ...current,
      nombre: clean,
      rol: "Mecánico Taller",
    });
  };

  const handleRepararEquipo = async () => {
    const nomClean = mecanicoNom.trim() || "Mecánico de Taller";
    if (
      !window.confirm(
        `¿Confirmar que ${maq.codigo} (${maq.nombre}) quedó reparada y disponible para salir a obra?`
      )
    ) {
      return;
    }
    persistMecanicoNombre(nomClean);
    setSubmitting(true);
    try {
      const res = await submitFieldMutation(
        `/api/equipos/${encodeURIComponent(maq.codigo)}/reparar`,
        {
          mecanico: nomClean,
          costo_rep: costoRepExterno,
          detalle_ot: detalleOtTrabajo,
        },
        `Cierre de pana ${maq.codigo}`
      );
      if (!res.ok) {
        await onRefresh({
          type: "error",
          text: res.data.error || "Error al cerrar falla.",
        });
      } else {
        await onRefresh({
          type: res.queuedOffline ? "warning" : "success",
          text: res.data.message || "Falla cerrada correctamente.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompletarPauta = async () => {
    const nomClean = mecanicoNom.trim() || "Mecánico de Taller";
    if (
      !window.confirm(
        `¿Confirmar término de mantención preventiva de ${maq.codigo} y reiniciar su ciclo a 0?`
      )
    ) {
      return;
    }
    persistMecanicoNombre(nomClean);
    setSubmitting(true);
    try {
      const res = await submitFieldMutation<{ warning?: boolean }>(
        `/api/equipos/${encodeURIComponent(maq.codigo)}/pauta`,
        {
          mecanico: nomClean,
          costo_rep: costoRepExterno,
          detalle_ot: detalleOtTrabajo,
          items_completados: tareasPautaMarcadas.length,
          total_items: pautaActual.length,
        },
        `Pauta preventiva ${maq.codigo}`
      );
      if (!res.ok) {
        await onRefresh({
          type: "error",
          text: res.data.error || "Error al guardar pauta.",
        });
      } else {
        await onRefresh({
          type: res.queuedOffline || res.data.warning ? "warning" : "success",
          text: res.data.message || "Pauta preventiva registrada.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleConsultarIa = async (modo: "diagnosticar" | "pauta") => {
    setLoadingIa(true);
    setErrorIa("");
    try {
      const res = await apiRequest<{ text?: string }>("/api/gemini/diagnose", {
        method: "POST",
        body: JSON.stringify({
          codigo: maq.codigo,
          modo,
          consulta: consultaIa,
        }),
      });
      if (!res.ok) {
        setErrorIa(res.data.error || "Error al consultar el asistente.");
      } else {
        setRespuestaIa(res.data.text || "");
      }
    } catch (e: any) {
      setErrorIa(e?.message || "Error de conexión.");
    } finally {
      setLoadingIa(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* COLUMNA IZQUIERDA: OT + DIAGNÓSTICO + PAUTA */}
      <div className="lg:col-span-7 space-y-5">
        <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
          <div className="bg-[#0C4A6E] text-white px-5 py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-sky-300" />
              <h5 className="text-sm font-bold uppercase tracking-wider">
                Gestión de Orden de Trabajo (OT)
              </h5>
            </div>
            {otActual && (
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded bg-sky-950 text-sky-200 font-mono text-xs font-bold border border-sky-700">
                  {otActual.folio} · {otActual.tipo}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onOpenPdf({
                      tipo: "ot",
                      ot: otActual,
                      equipo: maq,
                    })
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white text-[#0C4A6E] hover:bg-sky-50 font-bold text-xs cursor-pointer whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>PDF / Imprimir</span>
                </button>
              </div>
            )}
          </div>

          <div className="p-5 space-y-4">
            {!otActual ? (
              <>
                <p className="text-xs text-slate-600">
                  Sin Orden de Trabajo abierta. Se genera automáticamente al
                  ingresar en pana o puede abrirse manualmente para mantención.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    value={tipoNuevaOt}
                    onChange={(e) =>
                      setTipoNuevaOt(
                        e.target.value as "CORRECTIVA" | "PREVENTIVA"
                      )
                    }
                    className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold"
                  >
                    <option value="CORRECTIVA">CORRECTIVA</option>
                    <option value="PREVENTIVA">PREVENTIVA</option>
                  </select>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleAbrirOt}
                    className="flex items-center justify-center gap-2 rounded-lg bg-[#0369A1] hover:bg-[#0284C7] text-white font-bold py-2.5 px-4 text-sm cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Abrir Orden de Trabajo</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-lg bg-slate-100 border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-slate-700">
                    Abierta el{" "}
                    <strong className="font-mono">
                      {otActual.fecha_apertura}
                    </strong>{" "}
                    — {otActual.descripcion}
                  </div>
                  <span className="text-xs font-bold text-[#0369A1] font-mono tabular-nums">
                    Tiempo en taller:{" "}
                    {duracionLegible(otActual.fecha_apertura)}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Estado de la OT (toca para cambiar):
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {OT_ESTADOS_ABIERTOS.map((est) => {
                      const active = otActual.estado === est;
                      return (
                        <button
                          key={est}
                          type="button"
                          disabled={submitting || active}
                          onClick={() => handleActualizarEstadoOt(est)}
                          className={`min-h-[44px] rounded-lg px-3 py-2 text-xs font-bold border transition-all cursor-pointer ${
                            active
                              ? "bg-[#0F172A] text-white border-[#0F172A] shadow-xs"
                              : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300"
                          }`}
                        >
                          {est}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-800">
                    <Package className="w-4 h-4 text-[#0369A1]" />
                    <span>Repuestos Cargados a esta OT</span>
                  </div>
                  {repuestosDeEstaOt.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Sin repuestos imputados desde bodega.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <div className="overflow-x-auto rounded-lg border border-slate-200">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                            <tr>
                              <th className="py-2 px-3">Código</th>
                              <th className="py-2 px-3">Repuesto</th>
                              <th className="py-2 px-3 text-right">Cant.</th>
                              <th className="py-2 px-3 text-right">Unitario</th>
                              <th className="py-2 px-3 text-right">Subtotal</th>
                              <th className="py-2 px-3 text-right">Devolver</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {repuestosDeEstaOt.map((item) => (
                              <tr key={item.id}>
                                <td className="py-2 px-3 font-mono font-semibold">
                                  {item.codigo}
                                </td>
                                <td className="py-2 px-3">{item.nombre}</td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums">
                                  {item.cantidad} {item.unidad}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums">
                                  {formatCLP(item.costo_unitario)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-bold tabular-nums">
                                  {formatCLP(item.subtotal)}
                                </td>
                                <td className="py-2 px-3 text-right whitespace-nowrap">
                                  <button
                                    type="button"
                                    disabled={submitting}
                                    onClick={() =>
                                      handleRevertirRepuestoOt(
                                        item.id,
                                        item.nombre
                                      )
                                    }
                                    title="Devolver repuesto a bodega"
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-red-50 hover:text-red-700 border border-slate-300 text-[11px] font-semibold cursor-pointer"
                                  >
                                    <Undo2 className="w-3 h-3" />
                                    <span>Revertir</span>
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-slate-800 font-semibold">
                        Subtotal repuestos inventario:{" "}
                        <strong className="font-mono text-[#0369A1]">
                          {formatCLP(totalRepuestosOt)} CLP
                        </strong>
                      </p>
                    </div>
                  )}

                  {repuestosOrdenados.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end pt-1">
                      <div className="sm:col-span-7">
                        <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                          Agregar Repuesto Usado (de Bodega):
                        </label>
                        <select
                          value={repSelId}
                          onChange={(e) => setRepSelId(Number(e.target.value))}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs min-h-[44px]"
                        >
                          {repuestosOrdenados.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.stock <= r.stock_minimo
                                ? "[STOCK BAJO] "
                                : ""}
                              {r.nombre} — stock {r.stock} {r.unidad} (
                              {formatCLP(r.costo_unitario)})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                          Cant.:
                        </label>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={cantRepSel}
                          onChange={(e) =>
                            setCantRepSel(
                              Math.max(1, parseInt(e.target.value) || 1)
                            )
                          }
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-mono tabular-nums min-h-[44px]"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={handleAgregarRepuestoOt}
                          className="w-full min-h-[44px] rounded-lg bg-[#0369A1] hover:bg-[#0284C7] text-white font-bold py-2 px-3 text-xs cursor-pointer whitespace-nowrap"
                        >
                          Agregar a OT
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* DIAGNÓSTICO Y PAUTA DE TALLER */}
        <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
          <div className="bg-[#064E3B] text-white px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-emerald-300" />
              <h4 className="text-sm font-bold uppercase tracking-wider">
                Diagnóstico y Pauta Mecánica — {catMaq}
              </h4>
            </div>
          </div>

          <div className="p-6 space-y-5">
            <div className="rounded-xl border border-slate-300 overflow-hidden">
              <button
                type="button"
                onClick={() => setDiagExpanded(!diagExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-100 hover:bg-slate-200/70 text-xs md:text-sm font-bold text-slate-800 cursor-pointer min-h-[44px]"
              >
                <span>
                  Ver / Cambiar Fallas Detectadas en Desarme
                </span>
                {diagExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
              {diagExpanded && (
                <div className="p-4 space-y-3 bg-white border-t border-slate-200">
                  <p className="text-xs text-slate-600">
                    Fallas técnicas para <strong>{catMaq}</strong>:
                  </p>
                  <div className="space-y-2">
                    {listaPanasCat.map((pana) => {
                      const checked = panasTallerMarcadas.includes(pana);
                      return (
                        <label
                          key={pana}
                          className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                            checked
                              ? "bg-sky-50 border-sky-400 text-sky-950 font-semibold"
                              : "bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked)
                                setPanasTallerMarcadas([
                                  ...panasTallerMarcadas,
                                  pana,
                                ]);
                              else
                                setPanasTallerMarcadas(
                                  panasTallerMarcadas.filter((p) => p !== pana)
                                );
                            }}
                            className="mt-0.5 accent-[#0369A1]"
                          />
                          <span>{pana}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Otra falla detectada en banco:
                    </label>
                    <input
                      type="text"
                      value={otraPanaTaller}
                      onChange={(e) => setOtraPanaTaller(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleActualizarDiagnostico}
                    className="w-full min-h-[44px] rounded-lg bg-[#1E293B] hover:bg-slate-800 text-white font-bold py-2.5 px-4 text-xs cursor-pointer"
                  >
                    Guardar Diagnóstico (sin liberar máquina)
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2.5">
              <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-[#047857]" />
                <span>
                  Pauta de Mantención Preventiva ({catMaq}) —{" "}
                  {tareasPautaMarcadas.length}/{pautaActual.length}
                </span>
              </h5>
              <div className="space-y-2">
                {pautaActual.map((tarea) => {
                  const checked = tareasPautaMarcadas.includes(tarea);
                  return (
                    <label
                      key={tarea}
                      className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs md:text-sm cursor-pointer transition-colors ${
                        checked
                          ? "bg-emerald-50 border-emerald-400 text-emerald-950 font-semibold"
                          : "bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked)
                            setTareasPautaMarcadas([
                              ...tareasPautaMarcadas,
                              tarea,
                            ]);
                          else
                            setTareasPautaMarcadas(
                              tareasPautaMarcadas.filter((t) => t !== tarea)
                            );
                        }}
                        className="mt-0.5 accent-[#047857]"
                      />
                      <span>{tarea}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <hr className="border-slate-200" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mecánico que reparó:
                  </label>
                  <input
                    type="text"
                    value={mecanicoNom}
                    onChange={(e) => setMecanicoNom(e.target.value)}
                    placeholder="Ej: Pedro Soto"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Gasto externo — tornería, servicio externo ($ CLP):
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={5000}
                    value={costoRepExterno}
                    onChange={(e) =>
                      setCostoRepExterno(
                        Math.max(0, parseInt(e.target.value) || 0)
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Los repuestos de bodega agregados arriba se suman solos.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Qué trabajo se hizo:
                </label>
                <textarea
                  rows={4}
                  value={detalleOtTrabajo}
                  onChange={(e) => setDetalleOtTrabajo(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            {(() => {
              const mostrarReparada =
                tienePanaTaller || otActual?.tipo === "CORRECTIVA";
              const mostrarPreventiva =
                !tienePanaTaller ||
                otActual?.tipo === "PREVENTIVA" ||
                pautaCompleta;
              const ambosVisibles = mostrarReparada && mostrarPreventiva;

              return (
                <div
                  className={`sticky bottom-3 z-20 bg-white/95 backdrop-blur-xs pt-2 grid grid-cols-1 ${
                    ambosVisibles ? "sm:grid-cols-2" : ""
                  } gap-4`}
                >
                  {mostrarReparada && (
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        disabled={
                          submitting ||
                          !tienePanaTaller ||
                          esperaPresupuestoTaller
                        }
                        onClick={handleRepararEquipo}
                        className="w-full min-h-[56px] flex items-center justify-center gap-2 rounded-xl bg-[#0369A1] hover:bg-[#0284C7] disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold py-3.5 px-4 text-base shadow-lg cursor-pointer transition-all"
                      >
                        <Wrench className="w-5 h-5" />
                        <span>Marcar Reparada (Volver a Patio)</span>
                      </button>
                      {esperaPresupuestoTaller ? (
                        <p className="text-xs text-purple-800 font-semibold">
                          En espera: falta aprobar el presupuesto en Jefatura.
                        </p>
                      ) : !tienePanaTaller ? (
                        <p className="text-xs text-slate-500">
                          Sin falla activa por cerrar.
                        </p>
                      ) : null}
                    </div>
                  )}

                  {mostrarPreventiva && (
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        disabled={submitting || !pautaCompleta}
                        onClick={handleCompletarPauta}
                        className="w-full min-h-[56px] flex items-center justify-center gap-2 rounded-xl bg-[#065F46] hover:bg-[#047857] disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold py-3.5 px-4 text-base shadow-lg cursor-pointer transition-all"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                        <span>Mantención Terminada (Reiniciar Ciclo)</span>
                      </button>
                      {!pautaCompleta && (
                        <p className="text-xs text-amber-800 font-medium">
                          Marca los{" "}
                          {pautaActual.length - tareasPautaMarcadas.length}{" "}
                          puntos restantes de la pauta para habilitar.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* COLUMNA DERECHA: ASISTENTE TÉCNICO IA (GEMINI) */}
      <div className="lg:col-span-5">
        <details className="group bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
          <summary className="bg-[#1E293B] text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-700 cursor-pointer select-none list-none min-h-[48px]">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#38BDF8]" />
              <h4 className="text-sm font-bold uppercase tracking-wider">
                Asistente Técnico IA (Opcional)
              </h4>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-sky-300">
                {catMaq}
              </span>
              <ChevronDown className="w-4 h-4 text-slate-300 transition-transform group-open:rotate-180" />
            </div>
          </summary>

          <div className="p-6 space-y-4">
            {maq.panas_reportadas ? (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-950">
                <strong>Fallas activas en evaluación:</strong>{" "}
                {maq.panas_reportadas}
              </div>
            ) : (
              <div className="rounded-lg bg-slate-100 border border-slate-200 p-3 text-xs text-slate-700">
                <strong>Último registro:</strong>{" "}
                <em>{maq.ultima_observacion}</em>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Consulta técnica o síntoma en banco de prueba:
              </label>
              <textarea
                rows={4}
                value={consultaIa}
                onChange={(e) => setConsultaIa(e.target.value)}
                placeholder={`Ej: Procedimiento de diagnóstico paso a paso para ${maq.nombre}...`}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={loadingIa}
                onClick={() => handleConsultarIa("diagnosticar")}
                className="min-h-[44px] rounded-lg bg-[#0F172A] hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold py-2.5 px-3 text-xs md:text-sm cursor-pointer"
              >
                Diagnosticar Falla
              </button>
              <button
                type="button"
                disabled={loadingIa}
                onClick={() => handleConsultarIa("pauta")}
                className="min-h-[44px] rounded-lg bg-[#0369A1] hover:bg-[#0284C7] disabled:bg-slate-300 text-white font-bold py-2.5 px-3 text-xs md:text-sm cursor-pointer"
              >
                Procedimiento Pauta
              </button>
            </div>

            {loadingIa && (
              <div className="rounded-lg bg-slate-100 border border-slate-300 p-4 text-xs font-semibold text-slate-700">
                Procesando consulta técnica para {maq.codigo}...
              </div>
            )}

            {errorIa && (
              <div className="rounded-lg bg-red-50 border border-red-300 p-3.5 text-xs text-red-900 font-semibold">
                {errorIa}
              </div>
            )}

            {respuestaIa && !loadingIa && (
              <div className="rounded-lg bg-slate-50 border-2 border-[#0369A1]/40 p-4 space-y-2">
                <div className="text-xs font-extrabold uppercase tracking-wider text-[#0369A1]">
                  Informe Técnico Generado:
                </div>
                <div className="text-xs md:text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {respuestaIa}
                </div>
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
