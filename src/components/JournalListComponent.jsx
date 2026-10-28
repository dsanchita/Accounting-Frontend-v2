import { useState, useEffect } from "react";
import { toast } from "react-toastify";
import SideDialogBox from "../modals/SideDialogBox";
import { allJournalApi, deleteJournalApi } from "../apis/journalApi";
import { useAuth } from "../contexts/AuthContext";
import LoadingComponent from "./LoadingComponent";
import axios from "axios";
import { ApprovalManager } from "../utils/approvalManager";
import { checkAuthorization } from "../utils/checkAuthorization";

export default function JournalList({ open, onClose, id, initialSearch = "", onEditJournal }) {
  const [journals, setJournals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [, setApprovalRefreshTick] = useState(0);

  const { user } = useAuth();
const isAdmin =
  user?.role === "superAdmin" ||
  user?.role === "admin" ||
  user?.privilege?.masterUpdate === true;
  const canEditJournal = checkAuthorization(user, "JOURNAL", "EDIT");
  const canDeleteJournal = checkAuthorization(user, "JOURNAL", "DELETE");
  const refreshApprovals = async () => {
    if (!user?.company?._id) return;
    await ApprovalManager.syncRequests(user.company._id);
    setApprovalRefreshTick((prev) => prev + 1);
  };

  // Function to fetch journals
  const fetchJournals = async (signal) => {
    try {
      setLoading(true);
      const res = await allJournalApi(user?.company?._id, {}, signal);
      setJournals(res.data);
    } catch (err) {
      if (!axios.isCancel(err)) {
        console.error(err);
        toast.warn("Error fetching journal lists");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    if (open) {
      fetchJournals(controller.signal);
      refreshApprovals();
    }
    return () => controller.abort();
  }, [open, user?.company?._id]);

  // Handle delete confirmation
  const handleDeleteClick = async (journal, e) => {
  e.stopPropagation();
  if (!canDeleteJournal) return;
  if (isAdmin) {
    setConfirmDelete(journal);
  } else {
    // ADD THESE LOGS to verify
    console.log("Adding delete request:", {
      companyId: user?.company?._id,
      journalId: journal?._id,
      journalNumber: journal?.number,
      userId: user?._id,
      userName: user?.name,
    });

    if (!journal?._id || !journal?.number) {
      toast.error("Journal data is incomplete. Cannot send delete request.");
      return;
    }

    await ApprovalManager.addDeleteRequest(user?.company?._id, journal);
    toast.success("Delete request sent to admin!");
    await refreshApprovals();
    fetchJournals();
  }
};

  // Handle actual deletion
  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;

    try {
      setDeleting(true);
      await deleteJournalApi(user?.company?._id, confirmDelete._id);

      toast.success(`Journal ${confirmDelete.number} deleted successfully!`);

      // Remove from local state
      setJournals((prev) => prev.filter((j) => j._id !== confirmDelete._id));
      setConfirmDelete(null);
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Error deleting journal");
    } finally {
      setDeleting(false);
    }
  };

  // Handle edit click
  const handleEditClick = async (journal) => {
    if (!canEditJournal) return;
    if (isAdmin) {
      // Admin can edit directly
      onEditJournal(journal);
      onClose();
    } else {
      const hasPendingRequest = ApprovalManager.hasUserRequestedEdit(user?.company?._id, journal._id, user?._id);
      const isJournalLocked = ApprovalManager.isJournalLockedForEdit(user?.company?._id, journal._id);

      if (hasPendingRequest) {
        // User already has a pending request
        toast.info("Your edit request is pending admin approval.");
      } else if (isJournalLocked) {
        // Journal is locked by another user's pending request
        const pendingRequests = ApprovalManager.getPendingEditRequestsForJournal(user?.company?._id, journal._id);
        const otherUser = pendingRequests[0]?.requestedBy?.name || "another user";
        toast.warning(`This journal has a pending edit request from ${otherUser}. Please wait.`);
      } else {
        onEditJournal(journal);
        onClose();
      }
    }
  };

  // Get button status for a journal
  const getEditButtonStatus = (journal) => {
    if (!canEditJournal) return null;
    if (isAdmin) {
      return {
        text: "Edit",
        enabled: true,
        className: "bg-blue-100 text-blue-700 hover:bg-blue-200",
        tooltip: "Edit journal (Admin)"
      };
    }

    const hasPendingRequest = ApprovalManager.hasUserRequestedEdit(user?.company?._id, journal._id, user?._id);
    const isJournalLocked = ApprovalManager.isJournalLockedForEdit(user?.company?._id, journal._id);

    if (hasPendingRequest) {
      return {
        text: "Pending...",
        enabled: false,
        className: "bg-yellow-100 text-yellow-700",
        tooltip: "Edit request pending admin approval"
      };
    } else if (isJournalLocked) {
      const pendingRequests = ApprovalManager.getPendingEditRequestsForJournal(user?.company?._id, journal._id);
      const otherUser = pendingRequests[0]?.requestedBy?.name || "another user";
      return {
        text: "Locked",
        enabled: false,
        className: "bg-gray-100 text-gray-400",
        tooltip: `Journal locked by ${otherUser}'s pending request`
      };
    } else {
      return {
        text: "Edit & Request",
        enabled: true,
        className: "bg-blue-100 text-blue-700 hover:bg-blue-200",
        tooltip: "Edit journal and submit it for admin approval"
      };
    }
  };

  const filteredJournals = journals.filter((journal) => {
    const searchText = search.toLowerCase();
    return (
      journal.number?.toLowerCase().includes(searchText) ||
      journal.sourceType?.toLowerCase().includes(searchText) ||
      journal.referenceNumber?.toLowerCase().includes(searchText) ||
      journal.partyName?.toLowerCase().includes(searchText) ||
      journal.narration?.toLowerCase().includes(searchText) ||
      journal.lines?.some((line) => line.account?.name?.toLowerCase().includes(searchText))
    );
  });

  useEffect(() => {
    if (open && initialSearch) {
      setSearch(initialSearch);
    }
  }, [open, initialSearch]);

  const getDeleteButtonStatus = () => {
    if (!canDeleteJournal) return null;
    return {
      text: isAdmin ? "Delete" : "Request Delete",
      enabled: true,
      className: "bg-red-100 text-red-700 hover:bg-red-200",
      tooltip: isAdmin ? "Delete journal" : "Request journal deletion",
    };
  };

  // Confirmation Modal Component
  const DeleteConfirmationModal = () => {
    if (!confirmDelete) return null;

    return (
      <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Confirm Delete</h3>

          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
            <p className="text-sm text-red-800">
              Are you sure you want to delete journal <span className="font-bold">{confirmDelete.number}</span>?
            </p>
            <p className="text-xs text-red-600 mt-1">This action cannot be undone. All associated ledger entries will be removed.</p>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => setConfirmDelete(null)}
              disabled={deleting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {deleting ? "Deleting..." : "Delete Journal"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <SideDialogBox
        open={open}
        onClose={onClose}
        title={"Journal Lists"}
        subtitle={"Get information about previous journal entry/entries"}
        contents={
          <>
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search by journal no, party, reference, account, narration..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-500 text-sm"
              />
            </div>

            <div className="space-y-6">
              {loading && <LoadingComponent message="Loading journals..." />}

              {!loading && filteredJournals.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500">No journals found</p>
                </div>
              )}

              {!loading &&
                filteredJournals.map((journal) => {
                  const editButtonStatus = getEditButtonStatus(journal);
                  const deleteButtonStatus = getDeleteButtonStatus(journal);
                  const showActions = Boolean(editButtonStatus || deleteButtonStatus);

                  return (
                    <div key={journal._id} className="border border-neutral-200 rounded-lg overflow-hidden bg-white shadow-sm">
                      {/* Header */}
                      <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-200">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-neutral-900">{journal.number}</div>
                            <div className="text-xs text-neutral-600 space-x-2">
                              {journal.sourceType && <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">{journal.sourceType}</span>}
                              {journal.referenceNumber && (
                                <span>
                                  Ref: <span className="font-medium">{journal.referenceNumber}</span>
                                </span>
                              )}
                              {journal.partyName && (
                                <span>
                                  Party: <span className="font-medium">{journal.partyName}</span>
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="text-sm text-neutral-600 whitespace-nowrap">{new Date(journal.date).toLocaleDateString()}</div>
                            {showActions && (
                              <div className="flex gap-2">
                                {editButtonStatus && (
                                  <button
                                    onClick={() => handleEditClick(journal)}
                                    disabled={!editButtonStatus.enabled}
                                    className={`px-3 py-1 text-xs font-medium rounded ${editButtonStatus.className} ${!editButtonStatus.enabled ? "cursor-not-allowed" : "cursor-pointer"}`}
                                    title={editButtonStatus.tooltip}
                                  >
                                    {editButtonStatus.text}
                                  </button>
                                )}

                                {deleteButtonStatus && (
                                  <button
                                    onClick={(e) => handleDeleteClick(journal, e)}
                                    disabled={!deleteButtonStatus.enabled}
                                    className={`px-3 py-1 text-xs font-medium rounded ${deleteButtonStatus.className} ${!deleteButtonStatus.enabled ? "cursor-not-allowed" : "cursor-pointer"}`}
                                    title={deleteButtonStatus.tooltip}
                                  >
                                    {deleteButtonStatus.text}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-neutral-100 border-b border-neutral-200">
                              <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700 uppercase tracking-wider">Date</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700 uppercase tracking-wider">Particulars</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-700 uppercase tracking-wider">Debit</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-700 uppercase tracking-wider">Credit</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-200">
                            {journal.lines.map((line) => (
                              <tr key={line._id} className="hover:bg-neutral-50 transition-colors">
                                <td className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">{new Date(journal.date).toLocaleDateString()}</td>
                                <td className="px-4 py-3 text-sm text-neutral-900">
                                  {line.credit > 0 ? "To " : "By "}
                                  {line.account?.name || "Unknown Account"} A/c
                                </td>
                                <td className="px-4 py-3 text-sm text-neutral-900 text-right font-medium">{line.debit > 0 ? line.debit.toLocaleString() : "-"}</td>
                                <td className="px-4 py-3 text-sm text-neutral-900 text-right font-medium">{line.credit > 0 ? line.credit.toLocaleString() : "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Narration Footer */}
                      <div className="bg-neutral-50 px-4 py-3 border-t border-neutral-200 text-xs text-neutral-600 space-y-1">
                        {journal.narration && (
                          <div className="mb-2">
                            <p className="text-sm text-neutral-600">
                              <span className="font-medium text-neutral-500">Narration - </span>
                              {journal.narration}
                            </p>
                          </div>
                        )}
                        {journal.createdBy && (
                          <div>
                            Created by{" "}
                            <span className="font-medium text-neutral-800 capitalize">
                              {typeof journal.createdBy === "object"
                                ? journal.createdBy.name || journal.createdBy.email || "User"
                                : journal.createdBy}
                            </span>{" "}
                            on {new Date(journal.createdAt).toLocaleString()}
                          </div>
                        )}

                        {journal.updatedBy &&
                          (journal.updatedBy?._id || journal.updatedBy) !==
                            (journal.createdBy?._id || journal.createdBy) && (
                            <div>
                              Updated by{" "}
                              <span className="font-medium text-neutral-800 capitalize">
                                {typeof journal.updatedBy === "object"
                                  ? journal.updatedBy.name || journal.updatedBy.email || "User"
                                  : journal.updatedBy}
                              </span>{" "}
                              on {new Date(journal.updatedAt).toLocaleString()}
                            </div>
                          )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </>
        }
      />

      {/* Delete Confirmation Modal */}
      {confirmDelete && <DeleteConfirmationModal />}
    </>
  );
}
