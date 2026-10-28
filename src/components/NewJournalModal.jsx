import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getAccountsApi } from "../apis/accountApi";
import { addJournalApi } from "../apis/journalApi";

export default function NewJournalModal({ isOpen, onClose, onSave }) {
  const { user } = useAuth();
  const emptyLine = () => ({
    id: Date.now() + Math.random(),
    account: "",
    debit: "",
    credit: "",
    memo: "",
  });

  const [date, setDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [journalNo, setJournalNo] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [makeRecurring, setMakeRecurring] = useState(false);
  const [lines, setLines] = useState([emptyLine(), emptyLine()]);
  const [attachments, setAttachments] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Fetch accounts
  useEffect(() => {
    if (!user?.company?._id) return;

    getAccountsApi(user.company._id)
      .then((data) => setAccounts(Array.isArray(data?.data) ? data.data : []))
      .catch(() => setAccounts([]));
  }, [user?.company?._id]);

  useEffect(() => setError(""), [lines]);

  function addLine() {
    setLines((s) => [...s, emptyLine()]);
  }

  function removeLine(id) {
    if (lines.length <= 2) return;
    setLines((s) => s.filter((l) => l.id !== id));
  }

  function updateLine(id, patch) {
    setLines((s) => s.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function subtotal(col) {
    return lines.reduce((acc, l) => acc + Number(l[col] || 0), 0);
  }

  const totalDebit = subtotal("debit");
  const totalCredit = subtotal("credit");
  const difference = (totalDebit - totalCredit).toFixed(2);

  function onAttachChange(e) {
    const files = Array.from(e.target.files).slice(0, 5 - attachments.length);
    setAttachments((s) => [...s, ...files]);
  }

  async function handleSave(publish = true) {
    setError("");

    if (totalDebit.toFixed(2) !== totalCredit.toFixed(2)) {
      setError("Debits and Credits must be equal before saving.");
      return;
    }

    const payload = {
      date,
      journalNo,
      reference,
      notes,
      currency,
      makeRecurring,
      lines: lines.map(({ id, ...rest }) => rest),
      attachments: attachments.map((f) => f.name),
      published: publish,
    };

    setSaving(true);

    try {
      const saved = await addJournalApi(
        {
          voucherType: "Journal Entry",
          companyId: user?.company?._id,
          date,
          referenceNumber: reference,
          narration: notes,
          createdBy: user?._id || user?.id,
          lines: payload.lines.map((line) => ({
            accountId: line.account,
            debit: Number(line.debit || 0),
            credit: Number(line.credit || 0),
            description: line.memo || "",
          })),
        },
        user?.company?._id
      );

      onSave && onSave(saved);

      // Reset form
      setJournalNo("");
      setReference("");
      setNotes("");
      setLines([emptyLine(), emptyLine()]);
      setAttachments([]);

      onClose && onClose();
    } catch (err) {
      setError(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white w-full max-w-3xl rounded-xl shadow-xl p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">New Journal</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        {/* Fields */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="text-sm">Date*</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 p-2 border rounded w-full"
            />
          </div>
          <div>
            <label className="text-sm">Journal#</label>
            <input
              value={journalNo}
              onChange={(e) => setJournalNo(e.target.value)}
              className="mt-1 p-2 border rounded w-full"
              placeholder="Auto or manual"
            />
          </div>
          <div>
            <label className="text-sm">Reference#</label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="mt-1 p-2 border rounded w-full"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="text-sm">Notes</label>
          <textarea
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 p-2 border rounded w-full"
          />
        </div>

        {/* Currency + Recurring */}
        <div className="mb-4 flex items-center gap-4">
          <div>
            <label className="text-sm">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="mt-1 p-2 border rounded"
            >
              <option value="INR">INR</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>

          <div className="flex items-center gap-2 mt-6">
            <input
              type="checkbox"
              checked={makeRecurring}
              onChange={(e) => setMakeRecurring(e.target.checked)}
            />
            <label className="text-sm">Make Recurring</label>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 px-3">Account</th>
                <th className="py-2 px-3">Debit</th>
                <th className="py-2 px-3">Credit</th>
                <th className="py-2 px-3">Memo</th>
                <th className="py-2 px-3">Action</th>
              </tr>
            </thead>

            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-b">
                  <td className="p-2">
                    <select
                      value={line.account}
                      onChange={(e) =>
                        updateLine(line.id, { account: e.target.value })
                      }
                      className="p-2 border rounded w-full"
                    >
                      <option value="">Select account</option>
                      {accounts.map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.code} - {a.name}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="p-2">
                    <input
                      type="number"
                      step="1"
                      value={line.debit}
                      onChange={(e) =>
                        updateLine(line.id, {
                          debit: e.target.value,
                          credit: "",
                        })
                      }
                      className="p-2 border rounded w-full"
                    />
                  </td>

                  <td className="p-2">
                    <input
                      type="number"
                      step="1"
                      value={line.credit}
                      onChange={(e) =>
                        updateLine(line.id, {
                          credit: e.target.value,
                          debit: "",
                        })
                      }
                      className="p-2 border rounded w-full"
                    />
                  </td>

                  <td className="p-2">
                    <input
                      value={line.memo}
                      onChange={(e) =>
                        updateLine(line.id, { memo: e.target.value })
                      }
                      className="p-2 border rounded w-full"
                    />
                  </td>

                  <td className="p-2">
                    <button
                      onClick={() => removeLine(line.id)}
                      className="px-3 py-1 bg-red-50 text-red-600 rounded mr-2"
                    >
                      Remove
                    </button>
                    <button
                      onClick={addLine}
                      className="px-3 py-1 bg-blue-50 text-blue-700 rounded"
                    >
                      + Add
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="mt-3 flex justify-end gap-6">
          <div className="text-sm">
            <div>Debit: {totalDebit.toFixed(2)}</div>
            <div>Credit: {totalCredit.toFixed(2)}</div>
          </div>
          <div className="text-sm">
            Difference:{" "}
            <span
              className={
                difference === "0.00" ? "text-green-600" : "text-red-600"
              }
            >
              {difference}
            </span>
          </div>
        </div>

        {/* Attachments */}
        <div className="mt-4">
          <label className="text-sm">Attachments</label>
          <input
            type="file"
            multiple
            onChange={onAttachChange}
            className="mt-1"
          />

          {attachments.map((f, idx) => (
            <div
              key={idx}
              className="border p-2 mt-2 rounded flex justify-between"
            >
              <div className="truncate">{f.name}</div>
              <button
                onClick={() =>
                  setAttachments((s) => s.filter((_, i) => i !== idx))
                }
                className="text-red-600 text-sm"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {error && <div className="mt-4 text-red-600 text-sm">{error}</div>}

        {/* Buttons */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="px-4 py-2 bg-gray-100 rounded"
          >
            Save Draft
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded"
          >
            Save & Publish
          </button>
          <button onClick={onClose} className="px-4 py-2 border rounded">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
