import React, { useState, useEffect, useCallback } from "react";
import dayjs from "dayjs";
import {
  X, FileText, BookOpen, CheckCircle, ArrowUpRight,
  ArrowDownRight, Hash, Tag, CalendarDays, Clock,
  User, TrendingUp, CirclePlus, CircleMinus, Info,
  Search, Shield, AlertCircle
} from "lucide-react";
import { getJournalAuditLogsApi } from "../apis/auditLog.api";
import { useAuth } from "../contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";

const formatDate = (d) => dayjs(d).format("DD MMM YYYY");
const formatTime = (d) => dayjs(d).format("hh:mm A");
const formatDateTime = (d) => dayjs(d).format("DD MMM YYYY, hh:mm A");

const calculateTotalDebit  = (j) => j.lines?.reduce((s, l) => s + (l.debit  || 0), 0) || 0;
const calculateTotalCredit = (j) => j.lines?.reduce((s, l) => s + (l.credit || 0), 0) || 0;

const VOUCHER_COLORS = {
  SALES:    { cls: "bg-emerald-50 text-emerald-700 border-emerald-200",  g: "linear-gradient(135deg,#064e3b,#059669)", blob: "#6ee7b7" },
  PURCHASE: { cls: "bg-red-50 text-red-700 border-red-200",     g: "linear-gradient(135deg,#7f1d1d,#dc2626)", blob: "#fca5a5" },
  PAYMENT:  { cls: "bg-blue-50 text-blue-700 border-blue-200",   g: "linear-gradient(135deg,#1e3a8a,#2563eb)", blob: "#93c5fd" },
  RECEIPT:  { cls: "bg-purple-50 text-purple-700 border-purple-200", g: "linear-gradient(135deg,#312e81,#7c3aed)", blob: "#c4b5fd" },
  CONTRA:   { cls: "bg-amber-50 text-amber-700 border-amber-200", g: "linear-gradient(135deg,#92400e,#d97706)", blob: "#fde68a" },
  JOURNAL:  { cls: "bg-indigo-50 text-indigo-700 border-indigo-200", g: "linear-gradient(135deg,#1e3a8a,#4f46e5)", blob: "#a5b4fc" },
};

const getVoucherStyle = (type) =>
  VOUCHER_COLORS[type?.toUpperCase()] ||
  { cls: "bg-slate-100 text-slate-600 border-slate-200", g: "linear-gradient(135deg,#1e3a8a,#2563eb)", blob: "#93c5fd" };

const JournalDetailsModal = ({ open, isOpen, onClose, journal, voucherNo = null }) => {
  const visible = open || isOpen;
  const { user } = useAuth();
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const fetchAuditLogs = useCallback(async () => {
    if (!journal?._id || !user?.company?._id) return;
    try {
      setLoadingAudit(true);
      const res = await getJournalAuditLogsApi(user.company._id, journal._id);
      setAuditLogs(res.data?.data || []);
    } catch (error) {
      console.error("Error fetching journal audit logs:", error);
    } finally {
      setLoadingAudit(false);
    }
  }, [journal?._id, user?.company?._id]);

  useEffect(() => {
    if (visible && journal?._id) {
      fetchAuditLogs();
    } else {
      setAuditLogs([]);
    }
  }, [visible, journal?._id, fetchAuditLogs]);

  if (!visible || !journal) return null;

  const totalDebit  = calculateTotalDebit(journal);
  const totalCredit = calculateTotalCredit(journal);
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01;
  const vs          = getVoucherStyle(journal.voucherType);

  const renderJournalLineChanges = (details) => {
    if (!details) return null;
    return (
      <div className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Old Totals</p>
            <div className="flex justify-between items-center text-[10px] font-bold">
              <span className="text-red-600">D: {details.summary?.oldTotalDebit?.toFixed(0)}</span>
              <span className="text-emerald-600">C: {details.summary?.oldTotalCredit?.toFixed(0)}</span>
            </div>
          </div>
          <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">New Totals</p>
            <div className="flex justify-between items-center text-[10px] font-bold">
              <span className="text-red-600">D: {details.summary?.newTotalDebit?.toFixed(0)}</span>
              <span className="text-emerald-600">C: {details.summary?.newTotalCredit?.toFixed(0)}</span>
            </div>
          </div>
        </div>

        {details.added?.map((line, idx) => (
          <div key={`add-${idx}`} className="p-2 bg-emerald-50 border border-emerald-100 rounded-xl group/log">
            <div className="flex items-center gap-2 mb-1">
              <CirclePlus size={12} className="text-emerald-600" />
              <span className="text-[11px] font-bold text-emerald-800 line-clamp-1">{line.accountName}</span>
            </div>
            <div className="flex justify-between text-[10px] text-emerald-600 font-bold ml-5">
              <span>Debit: ₹{line.debit?.toFixed(0)}</span>
              <span>Credit: ₹{line.credit?.toFixed(0)}</span>
            </div>
          </div>
        ))}

        {details.removed?.map((line, idx) => (
          <div key={`rem-${idx}`} className="p-2 bg-red-50 border border-red-100 rounded-xl">
            <div className="flex items-center gap-2 mb-1">
              <CircleMinus size={12} className="text-red-600" />
              <span className="text-[11px] font-bold text-red-800 line-clamp-1">{line.accountName}</span>
            </div>
            <div className="flex justify-between text-[10px] text-red-600 font-bold ml-5">
               <span>Debit: ₹{line.debit?.toFixed(0)}</span>
               <span>Credit: ₹{line.credit?.toFixed(0)}</span>
            </div>
          </div>
        ))}

        {details.modified?.map((line, idx) => (
          <div key={`mod-${idx}`} className="p-2 bg-blue-50 border border-blue-100 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={12} className="text-blue-600" />
              <span className="text-[11px] font-bold text-blue-800 line-clamp-1">{line.accountName}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 ml-5">
              <div className="text-[10px] space-y-0.5">
                <p className="text-red-600 font-black tracking-widest uppercase text-[8px]">Old</p>
                <p className="text-slate-500">D: {line.oldDebit?.toFixed(0)}</p>
                <p className="text-slate-500">C: {line.oldCredit?.toFixed(0)}</p>
              </div>
              <div className="text-[10px] space-y-0.5">
                <p className="text-emerald-600 font-black tracking-widest uppercase text-[8px]">New</p>
                <p className="text-slate-500">D: {line.newDebit?.toFixed(0)}</p>
                <p className="text-slate-500">C: {line.newCredit?.toFixed(0)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderChangeComparison = (log) => {
    if (!log.changes || log.changes.length === 0) {
      return <p className="text-[10px] text-slate-400 italic py-2 text-center">No field changes recorded</p>;
    }
    return (
      <div className="space-y-3">
        {log.changes.map((change, idx) => {
          if (change.field === "journalLines") {
            return (
              <div key={idx} className="border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen size={11} className="text-blue-600" />
                  <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider">{change.label}</span>
                </div>
                {change.details && renderJournalLineChanges(change.details)}
              </div>
            );
          }
          return (
            <div key={idx} className="border border-slate-100 rounded-xl p-3 bg-slate-50/50">
              <p className="text-[10px] font-black text-slate-700 uppercase tracking-wider mb-2">{change.label}</p>
              <div className="grid grid-cols-2 gap-3 items-center">
                <div className="bg-red-50/50 p-2 rounded-lg border border-red-50 overflow-hidden">
                  <p className="text-red-600 text-[11px] font-bold line-through truncate opacity-60">{change.oldValue?.toString() || ""}</p>
                </div>
                <div className="bg-emerald-50/50 p-2 rounded-lg border border-emerald-50 overflow-hidden">
                  <p className="text-emerald-700 text-[11px] font-bold truncate">{change.newValue?.toString() || ""}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto overflow-x-hidden">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative bg-slate-50 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* ── Header ── */}
        <div className="shrink-0 rounded-t-2xl overflow-hidden relative z-10">
          <div className="flex items-center justify-between px-6 py-4" style={{ background: vs.g }}>
            <div className="flex items-center gap-3">
              <div className="absolute -top-6 -right-6 w-32 h-24 rounded-full opacity-20 blur-2xl pointer-events-none"
                   style={{ background: `radial-gradient(ellipse,${vs.blob},transparent)` }} />
              <div className="p-2 bg-white/20 rounded-xl border border-white/25">
                <BookOpen size={16} className="text-white" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-white tracking-tight">Journal Entry details</h3>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="flex items-center gap-1 text-[11px] text-white/70">
                    <CalendarDays size={10} /> {formatDate(journal.date)}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-white/70">
                    <Clock size={10} /> {formatDateTime(journal.createdAt)}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                  onClick={() => { window.location.href = "/accounting/journals/create"; }}
                  className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-all text-[11px] font-bold flex items-center gap-1.5"
                >
                  <CirclePlus size={13} /> New Journal
              </button>
              <button onClick={onClose} className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-all">
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Content Body ── */}
        <div className="flex-1 overflow-hidden flex bg-white">
          {/* Main Details (Left/Center) */}
          <div className={`p-6 overflow-y-auto space-y-6 ${auditLogs.length > 0 ? "w-2/3 border-r border-slate-100" : "w-full"}`}>
            
            {/* Info strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Number", value: journal.number, mono: true, icon: Hash },
                { label: "Type", value: journal.voucherType, badge: true, icon: Tag },
                { label: "Source", value: journal.sourceType, icon: Shield },
                { label: "Party", value: journal.partyName || "N/A", icon: User },
              ].map((s) => (
                <div key={s.label} className="bg-slate-50/50 rounded-2xl border border-slate-100 p-4 relative group">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{s.label}</p>
                  {s.badge ? (
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider ${vs.cls}`}>
                      {s.value}
                    </span>
                  ) : (
                    <p className={`text-xs font-black text-slate-800 ${s.mono ? "font-mono" : ""}`}>{s.value}</p>
                  )}
                  <s.icon size={11} className="absolute top-4 right-4 text-slate-300 opacity-50 group-hover:opacity-100 transition-opacity" />
                </div>
              ))}
            </div>

            {/* Narration */}
            <div className="bg-slate-50/50 rounded-2xl border border-slate-100 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Info size={11} className="text-blue-500" />
                <p className="text-[9px] font-black text-slate-700 uppercase tracking-widest">Narration</p>
              </div>
              <p className="text-xs font-medium text-slate-700 leading-relaxed italic">
                 {journal.narration || "No narration provided"}
              </p>
              {journal.referenceNumber && (
                <div className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 rounded-xl w-fit">
                   <Hash size={11} className="text-slate-400" />
                   <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Ref:</span>
                   <span className="text-[11px] font-mono font-black text-blue-700">{journal.referenceNumber}</span>
                </div>
              )}
            </div>

            {/* Line items table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
               <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen size={13} className="text-slate-400" />
                    <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Journal Lines</p>
                    <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-black text-white" style={{ background: vs.g }}>
                       {journal.lines?.length || 0}
                    </span>
                  </div>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-xs">
                   <thead>
                     <tr className="bg-slate-50/80">
                       <th className="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Particulars</th>
                       <th className="px-5 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest w-32">Debit (₹)</th>
                       <th className="px-5 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest w-32">Credit (₹)</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                     {journal.lines?.map((line, i) => (
                       <tr key={line._id || i} className="hover:bg-blue-50/30 transition-colors">
                         <td className="px-5 py-3.5">
                           <div className="flex items-center gap-3">
                             <div className={`w-8 h-8 rounded-xl flex items-center justify-center border shrink-0 ${line.debit > 0 ? "bg-red-50 border-red-100" : "bg-emerald-50 border-emerald-100"}`}>
                                {line.debit > 0 ? <ArrowDownRight size={14} className="text-red-500" /> : <ArrowUpRight size={14} className="text-emerald-500" />}
                             </div>
                             <div>
                               <p className="font-bold text-slate-800">
                                 <span className="text-slate-400 font-medium">{line.credit > 0 ? "To " : "By "}</span>
                                 {line.account?.name || "Unknown Account"}
                               </p>
                               {line.account?.code && <p className="text-[10px] text-slate-400 font-mono mt-0.5">Code: {line.account.code}</p>}
                               {(line.employeeName || line.paymentId) && (
                                 <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                                   {line.employeeName && (
                                     <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700 border border-indigo-200">
                                       👤 {line.employeeName} {line.employeeCode ? `(${line.employeeCode})` : ""}
                                     </span>
                                   )}
                                   {line.paymentId && (
                                     <span className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-blue-700">
                                       Payment ID: {line.paymentId}
                                     </span>
                                   )}
                                   {line.employeeDepartment && (
                                     <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                                       {line.employeeDepartment}
                                     </span>
                                   )}
                                 </div>
                               )}
                               {line.description && !line.employeeName && (
                                 <p className="mt-0.5 text-[11px] text-slate-500 italic">{line.description}</p>
                               )}
                             </div>
                           </div>
                         </td>
                         <td className="px-5 py-3.5 text-right font-black text-slate-900 tabular-nums">
                           {line.debit > 0 ? line.debit.toLocaleString() : "—"}
                         </td>
                         <td className="px-5 py-3.5 text-right font-black text-slate-900 tabular-nums">
                           {line.credit > 0 ? line.credit.toLocaleString() : "—"}
                         </td>
                       </tr>
                     ))}
                   </tbody>
                   <tfoot className="bg-slate-50/80 border-t border-slate-100">
                     <tr className="font-black text-slate-900">
                        <td className="px-5 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Totals</td>
                        <td className="px-5 py-3 text-right tabular-nums text-red-600">₹{totalDebit.toLocaleString()}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-emerald-600">₹{totalCredit.toLocaleString()}</td>
                     </tr>
                    <tr className={isBalanced ? "bg-emerald-50/50" : "bg-red-50/50"}>
                       <td className="px-5 py-2.5 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Status</td>
                       <td colSpan={2} className="px-5 py-2.5 text-right">
                          <span className={`inline-flex items-center gap-1.5 text-[10px] font-black ${isBalanced ? "text-emerald-700" : "text-red-600"}`}>
                            {isBalanced ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                            {isBalanced ? "Perfectly Balanced" : "Out of Balance"}
                          </span>
                       </td>
                    </tr>
                   </tfoot>
                 </table>
               </div>
            </div>

            {/* Metadata strip */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Authenticated by</p>
                 <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold">
                     {(journal.createdBy?.name || "?")[0].toUpperCase()}
                   </div>
                   <div>
                     <p className="text-xs font-bold text-slate-800">{journal.createdBy?.name || "System"}</p>
                     <p className="text-[10px] text-slate-400">{formatDateTime(journal.createdAt)}</p>
                   </div>
                 </div>
              </div>
              {journal.updatedBy && (
                 <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Last Modified</p>
                   <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-[10px] font-bold">
                       {(journal.updatedBy?.name || "?")[0].toUpperCase()}
                     </div>
                     <div>
                       <p className="text-xs font-bold text-slate-800">{journal.updatedBy?.name || "N/A"}</p>
                       <p className="text-[10px] text-slate-400">{formatDateTime(journal.updatedAt)}</p>
                     </div>
                   </div>
                 </div>
              )}
            </div>
          </div>

          {/* Audit Logs Sidebar (Right) */}
          {auditLogs.length > 0 && (
            <div className="w-1/3 bg-slate-50/80 overflow-y-auto flex flex-col border-l border-slate-100">
               <div className="p-6 border-b border-slate-200 bg-white sticky top-0 z-10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                     <TrendingUp size={16} className="text-blue-600" />
                     <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Update History</h4>
                  </div>
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-black rounded-full">
                    {auditLogs.length}
                  </span>
               </div>
               <div className="p-4 space-y-6">
                 {loadingAudit ? (
                   <div className="flex flex-col items-center justify-center py-10 gap-3">
                      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Syncing history…</p>
                   </div>
                 ) : (
                   auditLogs.map((log, idx) => (
                     <div key={log._id || idx} className="relative pl-6 pb-2 border-l-2 border-slate-200 last:border-l-0">
                        <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-blue-500 shadow-sm flex items-center justify-center">
                           <div className="w-1 h-1 rounded-full bg-blue-500" />
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow">
                           <div className="flex items-center justify-between mb-3">
                              <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Update #{auditLogs.length - idx}</p>
                              <span className="text-[9px] font-bold text-slate-400">{dayjs(log.createdAt).format("DD MMM · HH:mm")}</span>
                           </div>
                           <div className="flex items-center gap-2 mb-4">
                              <div className="w-5 h-5 rounded-md bg-slate-100 flex items-center justify-center text-[8px] font-bold text-slate-500 uppercase">
                                {(log.performedBy?.name || "S")[0]}
                              </div>
                              <p className="text-[10px] font-bold text-slate-800">{log.performedBy?.name || "System"}</p>
                           </div>
                           <div className="pt-3 border-t border-slate-100">
                             {renderChangeComparison(log)}
                           </div>
                        </div>
                     </div>
                   ))
                 )}
               </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="shrink-0 p-4 border-t border-slate-200 bg-white flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Journal Status:</p>
            <span className={`flex items-center gap-1 text-[10px] font-black px-3 py-1 rounded-full border ${isBalanced ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-red-100 text-red-700 border-red-200"}`}>
               {isBalanced ? <Shield size={11} /> : <AlertCircle size={11} />}
               {isBalanced ? "Verified & Posted" : "Sync Error / Imbalance"}
            </span>
          </div>
          <button onClick={onClose} className="px-6 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20">
            Close View
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default JournalDetailsModal;