import { useEffect, useState, useCallback } from "react";
import { toast } from "react-toastify";
import { allJournalApi, deleteJournalApi } from "../apis/journalApi";
import { useAuth } from "../contexts/AuthContext";
import LoadingComponent from "../components/LoadingComponent";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  X, Search, FileText, Trash2, Calendar,
  User, Tag, Hash, ArrowUpRight, ArrowDownLeft,
  AlertTriangle, BookOpen, Pencil,
} from "lucide-react";
import { checkAuthorization } from "../utils/checkAuthorization";

/* ─── tiny helpers ────────────────────────────────────── */
const fmt = (n) =>
  n != null ? `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—";

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

const fmtDateTime = (d) =>
  d
    ? new Date(d).toLocaleString("en-IN", {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════ */
export default function JournalPopupModal({ open, onClose, initialSearch = "" }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [journals, setJournals]           = useState([]);
  const [filteredJournal, setFilteredJournal] = useState(null);
  const [loading, setLoading]             = useState(false);
  const [search, setSearch]               = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting]           = useState(false);

  /* ── fetch journals when open ──────────────────────── */
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    (async () => {
      try {
        setLoading(true);
        const res = await allJournalApi(user?.company?._id, {}, controller.signal);
        setJournals(res.data);
      } catch (err) {
        if (!axios.isCancel(err)) toast.error("Failed to fetch journals");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [open, user?.company?._id]);

  /* ── set initial search ────────────────────────────── */
  useEffect(() => {
    if (open && initialSearch) setSearch(initialSearch);
  }, [open, initialSearch]);

  /* ── filter on search change ───────────────────────── */
  useEffect(() => {
    if (!search.trim()) { setFilteredJournal(null); return; }
    const q = search.toLowerCase();
    const found = journals.find(
      (j) =>
        j.number?.toLowerCase().includes(q) ||
        j.sourceType?.toLowerCase().includes(q) ||
        j.referenceNumber?.toLowerCase().includes(q) ||
        j.partyName?.toLowerCase().includes(q) ||
        j.narration?.toLowerCase().includes(q) ||
        j.lines?.some((l) => l.account?.name?.toLowerCase().includes(q))
    );
    setFilteredJournal(found || null);
  }, [search, journals]);

  /* ── delete ────────────────────────────────────────── */
  const handleDeleteConfirm = useCallback(async () => {
    if (!confirmDelete) return;
    try {
      setDeleting(true);
      await deleteJournalApi(user?.company?._id, confirmDelete._id);
      toast.success(`Journal ${confirmDelete.number} deleted`);
      setJournals((p) => p.filter((j) => j._id !== confirmDelete._id));
      setFilteredJournal(null);
      setConfirmDelete(null);
      onClose();
    } catch {
      toast.error("Error deleting journal");
    } finally {
      setDeleting(false);
    }
  }, [confirmDelete, user?.company?._id, onClose]);

  const canManage =
    user?.role === "admin" ||
    user?.role === "superAdmin" ||
    user?.privilege?.masterUpdate === true;
  const canEditJournal = checkAuthorization(user, "JOURNAL", "EDIT");
  const canDeleteJournal = checkAuthorization(user, "JOURNAL", "DELETE");

  const handleEditJournal = useCallback(() => {
    if (!filteredJournal || !canEditJournal) return;

    if (
      filteredJournal.sourceType &&
      !["MANUAL", "EXCEL"].includes(filteredJournal.sourceType)
    ) {
      toast.info("This journal is system-generated. Please edit the source document.");
      return;
    }

    navigate("/accounting/journals/create", {
      state: {
        editingJournal: filteredJournal,
        isEditing: true,
      },
    });
    onClose();
  }, [filteredJournal, navigate, onClose, canEditJournal]);

  /* ── totals ────────────────────────────────────────── */
  const totalDebit  = filteredJournal?.lines?.reduce((s, l) => s + (l.debit  || 0), 0) ?? 0;
  const totalCredit = filteredJournal?.lines?.reduce((s, l) => s + (l.credit || 0), 0) ?? 0;

  if (!open) return null;

  return (
    <>
      {/* ── MAIN MODAL ─────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[500] flex items-center justify-center p-3 sm:p-6"
        style={{ background: "rgba(15,23,42,0.62)", backdropFilter: "blur(6px)" }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 20 }}
          transition={{ type: "spring", damping: 28, stiffness: 360 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
          style={{ boxShadow: "0 32px 80px rgba(15,23,42,0.28)" }}
        >
          {/* ── Header ─────────────────────────────────── */}
          <div
            className="relative overflow-hidden px-7 pt-6 pb-5 shrink-0"
            style={{ background: "linear-gradient(135deg,#eff6ff 0%,#ffffff 100%)" }}
          >
            <div className="absolute -top-6 -right-6 w-36 h-36 rounded-full opacity-20 blur-3xl pointer-events-none"
              style={{ background: "radial-gradient(ellipse,#3b82f6,transparent)" }} />
            <div className="absolute -bottom-4 -left-4 w-24 h-24 rounded-full opacity-15 blur-2xl pointer-events-none"
              style={{ background: "radial-gradient(ellipse,#6366f1,transparent)" }} />

            <div className="relative z-10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl shadow-lg shrink-0"
                  style={{ background: "linear-gradient(135deg,#1e40af,#3b82f6)" }}>
                  <BookOpen size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900 leading-tight">Journal Details</h2>
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">Search and view journal entries</p>
                </div>
              </div>
              <button onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100/80 transition-all">
                <X size={20} />
              </button>
            </div>

            {/* Search */}
            <div className="relative z-10 mt-5">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                autoFocus
                type="text"
                placeholder="Search by journal no., reference, party, account, narration…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-11 pr-10 py-3 text-sm bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none font-medium placeholder-slate-400 shadow-sm"
              />
              {search && (
                <button onClick={() => setSearch("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={15} />
                </button>
              )}
            </div>
          </div>

          {/* ── Body ───────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto bg-slate-50/40 px-7 py-5">

            {loading && <div className="py-14"><LoadingComponent message="Loading journals…" /></div>}

            {/* Idle state */}
            {!loading && !search && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="p-4 rounded-2xl" style={{ background: "linear-gradient(135deg,#eff6ff,#dbeafe)" }}>
                  <Search size={26} className="text-blue-300" />
                </div>
                <p className="text-sm font-bold text-slate-500">Type to search a journal</p>
                <p className="text-xs text-slate-400">Search by journal number, reference, party name or narration</p>
              </div>
            )}

            {/* Not found */}
            {!loading && search && !filteredJournal && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="p-4 rounded-2xl" style={{ background: "linear-gradient(135deg,#f1f5f9,#e2e8f0)" }}>
                  <FileText size={26} className="text-slate-300" />
                </div>
                <p className="text-sm font-bold text-slate-500">No journal found</p>
                <p className="text-xs text-slate-400 text-center max-w-xs">
                  No match for "<span className="font-bold text-slate-600">{search}</span>". Try a different search term.
                </p>
              </div>
            )}

            {/* Journal card */}
            {!loading && filteredJournal && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
              >
                {/* Journal header */}
                <div
                  className="px-6 py-5 border-b border-slate-100"
                  style={{ background: "linear-gradient(90deg,#f8fafc 0%,#eff6ff 100%)" }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2.5">
                      {/* Number */}
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-6 rounded-full" style={{ background: "linear-gradient(180deg,#1e40af,#60a5fa)" }} />
                        <span className="text-base font-extrabold text-slate-900">{filteredJournal.number}</span>
                      </div>

                      {/* Meta pills */}
                      <div className="flex flex-wrap items-center gap-2">
                        {filteredJournal.sourceType && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-100 text-blue-700 border border-blue-200 uppercase tracking-wider">
                            <Tag size={9} /> {filteredJournal.sourceType}
                          </span>
                        )}
                        {filteredJournal.referenceNumber && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-slate-100 text-slate-600 border border-slate-200 font-mono">
                            <Hash size={9} /> {filteredJournal.referenceNumber}
                          </span>
                        )}
                        {filteredJournal.partyName && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-slate-100 text-slate-600 border border-slate-200">
                            <User size={9} /> {filteredJournal.partyName}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-slate-100 text-slate-600 border border-slate-200">
                          <Calendar size={9} /> {fmtDate(filteredJournal.date)}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    {((canDeleteJournal && canManage) ||
                      (canEditJournal &&
                        ["MANUAL", "EXCEL"].includes(filteredJournal.sourceType))) && (
                      <div className="flex items-center gap-2 shrink-0">
                        {canEditJournal &&
                          ["MANUAL", "EXCEL"].includes(filteredJournal.sourceType) && (
                          <button
                            onClick={handleEditJournal}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 transition-all"
                          >
                            <Pencil size={12} /> Edit
                          </button>
                        )}
                        {canDeleteJournal && canManage && (
                          <button
                            onClick={() => setConfirmDelete(filteredJournal)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 transition-all"
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Journal lines table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: "linear-gradient(90deg,#f1f5f9,#dbeafe)" }}>
                        <th className="px-5 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Date</th>
                        <th className="px-5 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Particulars</th>
                        <th className="px-5 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest w-32">Debit</th>
                        <th className="px-5 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest w-32">Credit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredJournal.lines?.map((line, i) => (
                        <tr key={line._id || i} className="hover:bg-slate-50/80 transition-colors group">
                          <td className="px-5 py-3.5 whitespace-nowrap text-[11px] font-bold text-slate-600">
                            {fmtDate(filteredJournal.date)}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${line.debit > 0 ? "bg-blue-500" : "bg-violet-500"}`} />
                              <span className="font-semibold text-slate-800">
                                <span className="text-slate-400">{line.credit > 0 ? "To " : "By "}</span>
                                {line.account?.name || "Unknown Account"} A/c
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-right tabular-nums whitespace-nowrap">
                            {line.debit > 0
                              ? <span className="font-black text-blue-700">{fmt(line.debit)}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-5 py-3.5 text-right tabular-nums whitespace-nowrap">
                            {line.credit > 0
                              ? <span className="font-black text-violet-700">{fmt(line.credit)}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Totals row */}
                    <tfoot>
                      <tr style={{ background: "linear-gradient(90deg,#f8fafc,#eff6ff)" }}>
                        <td colSpan={2} className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Total
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">
                          <span className="flex items-center justify-end gap-1 text-[12px] font-black text-blue-700">
                            <ArrowUpRight size={12} /> {fmt(totalDebit)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">
                          <span className="flex items-center justify-end gap-1 text-[12px] font-black text-violet-700">
                            <ArrowDownLeft size={12} /> {fmt(totalCredit)}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Footer meta */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/70 space-y-1.5">
                  {filteredJournal.narration && (
                    <p className="text-[11px] text-slate-600">
                      <span className="font-black text-slate-400 uppercase tracking-wider mr-2">Narration</span>
                      {filteredJournal.narration}
                    </p>
                  )}
                  {filteredJournal.createdBy && (
                    <p className="text-[10px] text-slate-400">
                      Created by{" "}
                      <span className="font-bold text-slate-600 capitalize">
                        {typeof filteredJournal.createdBy === "object"
                          ? filteredJournal.createdBy.name || filteredJournal.createdBy.email || "User"
                          : filteredJournal.createdBy}
                      </span>
                      {" "}on {fmtDateTime(filteredJournal.createdAt)}
                    </p>
                  )}
                  {filteredJournal.updatedBy &&
                    (filteredJournal.updatedBy?._id || filteredJournal.updatedBy) !==
                      (filteredJournal.createdBy?._id || filteredJournal.createdBy) && (
                      <p className="text-[10px] text-slate-400">
                        Updated by{" "}
                        <span className="font-bold text-slate-600 capitalize">
                          {typeof filteredJournal.updatedBy === "object"
                            ? filteredJournal.updatedBy.name || filteredJournal.updatedBy.email || "User"
                            : filteredJournal.updatedBy}
                        </span>
                        {" "}on {fmtDateTime(filteredJournal.updatedAt)}
                      </p>
                    )}
                </div>
              </motion.div>
            )}
          </div>

          {/* ── Footer ───────────────────────────────── */}
          <div className="shrink-0 border-t border-slate-100 px-7 py-4 bg-slate-50/70 flex items-center justify-between">
            <p className="text-[10px] text-slate-400 font-medium">
              {journals.length > 0
                ? <><span className="font-bold text-slate-600">{journals.length}</span> journals loaded</>
                : "No journals loaded"}
            </p>
            <button onClick={onClose}
              className="flex items-center gap-1.5 px-5 py-2 text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-all">
              <X size={11} /> Close
            </button>
          </div>
        </motion.div>
      </motion.div>

      {/* ── DELETE CONFIRM ─────────────────────────────── */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[600] flex items-center justify-center p-4"
            style={{ background: "rgba(15,23,42,0.65)", backdropFilter: "blur(4px)" }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 8 }}
              className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-red-100 rounded-xl">
                  <AlertTriangle size={18} className="text-red-600" />
                </div>
                <div>
                  <p className="text-sm font-extrabold text-slate-900">Delete Journal?</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">This action cannot be undone</p>
                </div>
              </div>

              <div className="bg-red-50 border border-red-100 rounded-xl p-3.5 mb-5">
                <p className="text-xs text-red-800 font-medium">
                  You are about to delete journal{" "}
                  <span className="font-black">{confirmDelete.number}</span>.
                  All associated ledger entries will be permanently removed.
                </p>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmDelete(null)}
                  disabled={deleting}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 disabled:opacity-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={deleting}
                  className="px-4 py-2 text-xs font-bold text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:opacity-90"
                  style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)", boxShadow: "0 4px 12px rgba(239,68,68,0.35)" }}
                >
                  {deleting ? "Deleting…" : "Delete Journal"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
