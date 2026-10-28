import { useState, useEffect, useCallback } from "react";
import SideDialogBox from "../modals/SideDialogBox";
import { useAuth } from "../contexts/AuthContext";
import { ApprovalManager } from "../utils/approvalManager";
import { deleteJournalApi, allJournalApi } from "../apis/journalApi";
import { toast } from "react-toastify";
import {
  Check,
  X,
  Trash2,
  Edit2,
  Clock,
  User,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileText,
} from "lucide-react";
import LoadingComponent from "../components/LoadingComponent";
import axios from "axios";
import { useNotifications } from "../modules/notification/notification.slice.jsx";
import { checkAuthorization } from "../utils/checkAuthorization";

export default function AdminApprovalsDialog({ open, onClose }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [journals, setJournals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [expandedRequestId, setExpandedRequestId] = useState(null);
  const [loadingJournals, setLoadingJournals] = useState(false);
  const { refreshNotifications } = useNotifications();

  const isAdmin =
    user?.role === "superAdmin" ||
    user?.role === "admin" ||
    user?.privilege?.masterUpdate === true;
  const canReviewJournalApprovals = checkAuthorization(user, "JOURNAL", "EDIT");

  // useEffect(() => {
  //   if (open && isAdmin) {
  //     loadRequests();
  //     fetchJournals();
  //   }
  // }, [open, isAdmin]);

  // Fetch all journals to get details for each request
  const fetchJournals = useCallback(async () => {
    try {
      setLoadingJournals(true);
      const res = await allJournalApi(user?.company?._id, {});
      setJournals(res.data || []);
    } catch (error) {
      if (!axios.isCancel(error)) {
        console.error("Error fetching journals:", error);
        toast.error(
          error?.response?.data?.message || "Error loading journal details",
        );
      }
    } finally {
      setLoadingJournals(false);
    }
  }, [user?.company?._id]);

  const loadRequests = useCallback(async () => {
    try {
      if (!user?.company?._id) {
        return;
      }

      const allRequests = await ApprovalManager.syncRequests(user.company._id);
      const pending = allRequests.filter((r) => r.status === "pending");
      setRequests(pending);
    } catch (error) {
      console.error("Error loading requests:", error);
      toast.error(
        error?.response?.data?.message || "Error loading approval requests",
      );
    }
  }, [user?.company?._id]);

  useEffect(() => {
    if (!open || !isAdmin) return undefined;

    loadRequests();
    fetchJournals();

    const intervalId = window.setInterval(() => {
      loadRequests();
    }, 12000);

    const handleFocus = () => {
      loadRequests();
      refreshNotifications({ silent: true });
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [open, isAdmin, refreshNotifications, loadRequests, fetchJournals]);

  const handleApprove = async (request) => {
    try {
      setProcessing(true);

      if (request.type === "delete") {
        await ApprovalManager.approveRequest(user.company._id, request._id);
        toast.success(`Journal ${request.journalNumber} deleted!`);
      } else {
        await ApprovalManager.approveRequest(user.company._id, request._id);
        toast.success(
          `Edit request for Journal ${request.journalNumber} approved! User can now edit.`,
        );
      }

      // Refresh lists
      loadRequests();
      fetchJournals();
      await refreshNotifications({ silent: true });
    } catch (error) {
      console.error("Error approving request:", error);
      toast.error(error?.response?.data?.message || "Error approving request");
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (request) => {
    try {
      await ApprovalManager.rejectRequest(user.company._id, request._id);

      toast.success("Request rejected!");

      // Refresh lists
      loadRequests();
      await refreshNotifications({ silent: true });
    } catch (error) {
      console.error("Error rejecting request:", error);
      toast.error(error?.response?.data?.message || "Error rejecting request");
    }
  };

  // Get journal details for a request
  const getJournalDetails = (request) => {
    return journals.find((j) => j._id === request.journalId);
  };

  const toggleExpandRequest = (requestId) => {
    setExpandedRequestId(expandedRequestId === requestId ? null : requestId);
  };

  if (!isAdmin || !canReviewJournalApprovals) {
    // // console.log("User is not admin, not showing dialog. User:", user);
    return null;
  }

  return (
    <SideDialogBox
      open={open}
      onClose={onClose}
      title="Approval Requests"
      subtitle="Review pending requests from users"
      contents={
        <div className="space-y-6">
          {loadingJournals && (
            <LoadingComponent message="Loading journal details..." />
          )}

          {requests.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No pending requests</p>
              <p className="text-sm text-gray-500 mt-2">
                All requests have been processed.
              </p>
            </div>
          ) : (
            requests.map((request) => {
              const journalDetails = getJournalDetails(request);
              const isExpanded = expandedRequestId === request._id;

              return (
                <div
                  key={request._id}
                  className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm"
                >
                  {/* Request Header */}
                  <div className="p-4 border-b border-gray-200 bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        {request.type === "delete" ? (
                          <div className="p-2 bg-red-100 rounded-md">
                            <Trash2 className="w-5 h-5 text-red-600" />
                          </div>
                        ) : (
                          <div className="p-2 bg-blue-100 rounded-md">
                            <Edit2 className="w-5 h-5 text-blue-600" />
                          </div>
                        )}
                        <div>
                          <h4 className="font-semibold text-gray-900">
                            {request.type === "delete"
                              ? "Delete Request"
                              : "Edit Approval Request"}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                            <User className="w-3 h-3" />
                            <span>
                              Requested by:{" "}
                              <span className="font-medium">
                                {request.requestedBy?.name || "Unknown"}
                              </span>
                            </span>
                            <span className="mx-1">•</span>
                            <span>
                              {new Date(
                                request.requestedAt,
                              ).toLocaleDateString()}
                            </span>
                            <span>
                              {new Date(
                                request.requestedAt,
                              ).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-sm font-semibold text-gray-900">
                            Journal #{request.journalNumber}
                          </div>
                          {journalDetails && (
                            <div className="text-xs text-gray-600">
                              Date:{" "}
                              {new Date(
                                journalDetails.date,
                              ).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => toggleExpandRequest(request._id)}
                          className="p-1 text-gray-500 hover:text-gray-700 cursor-pointer"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5" />
                          ) : (
                            <ChevronDown className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {request.type === "edit" && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 p-2 rounded">
                        <AlertCircle className="w-3 h-3" />
                        <span>
                          Approving this will allow{" "}
                          <span className="font-semibold">
                            {request.requestedBy?.name || "the user"}
                          </span>{" "}
                          to edit the journal once.
                        </span>
                      </div>
                    )}

                    {request.type === "delete" && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                        <AlertCircle className="w-3 h-3" />
                        <span>
                          Approving this will permanently delete Journal{" "}
                          <span className="font-semibold">
                            #{request.journalNumber}
                          </span>{" "}
                          and all associated ledger entries.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Journal Details (Expanded) */}
                  {isExpanded && journalDetails && (
                    <div className="p-4 border-b border-gray-200">
                      <div className="mb-4">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="w-4 h-4 text-gray-500" />
                          <h5 className="text-sm font-semibold text-gray-700">
                            Journal Details
                          </h5>
                        </div>

                        {/* Journal Header Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div className="bg-gray-50 p-3 rounded-md">
                            <div className="text-xs text-gray-500 mb-1">
                              Voucher Type
                            </div>
                            <div className="text-sm font-medium text-gray-900">
                              {journalDetails.voucherType || "JOURNAL"}
                            </div>
                          </div>
                          <div className="bg-gray-50 p-3 rounded-md">
                            <div className="text-xs text-gray-500 mb-1">
                              Date
                            </div>
                            <div className="text-sm font-medium text-gray-900">
                              {new Date(
                                journalDetails.date,
                              ).toLocaleDateString()}
                            </div>
                          </div>
                          {journalDetails.referenceNumber && (
                            <div className="bg-gray-50 p-3 rounded-md">
                              <div className="text-xs text-gray-500 mb-1">
                                Reference Number
                              </div>
                              <div className="text-sm font-medium text-gray-900">
                                {journalDetails.referenceNumber}
                              </div>
                            </div>
                          )}
                          {journalDetails.partyName && (
                            <div className="bg-gray-50 p-3 rounded-md">
                              <div className="text-xs text-gray-500 mb-1">
                                Party
                              </div>
                              <div className="text-sm font-medium text-gray-900">
                                {journalDetails.partyName}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Journal Entries Table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-100 border-b border-gray-300">
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                  Date
                                </th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                  Particulars
                                </th>
                                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                  Debit
                                </th>
                                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                  Credit
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {journalDetails.lines.map((line) => (
                                <tr key={line._id} className="hover:bg-gray-50">
                                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                                    {new Date(
                                      journalDetails.date,
                                    ).toLocaleDateString()}
                                  </td>
                                  <td className="px-3 py-2 text-gray-900">
                                    {line.credit > 0 ? "To " : "By "}
                                    {line.account?.name ||
                                      "Unknown Account"}{" "}
                                    A/c
                                  </td>
                                  <td className="px-3 py-2 text-gray-900 text-right font-medium">
                                    {line.debit > 0
                                      ? line.debit.toLocaleString("en-IN", {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                        })
                                      : "-"}
                                  </td>
                                  <td className="px-3 py-2 text-gray-900 text-right font-medium">
                                    {line.credit > 0
                                      ? line.credit.toLocaleString("en-IN", {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                        })
                                      : "-"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-gray-50 border-t border-gray-300">
                              <tr>
                                <td
                                  colSpan="2"
                                  className="px-3 py-2 text-right text-xs font-semibold text-gray-700"
                                >
                                  Total
                                </td>
                                <td className="px-3 py-2 text-right text-sm font-bold text-gray-900">
                                  {journalDetails.lines
                                    .reduce(
                                      (sum, line) => sum + (line.debit || 0),
                                      0,
                                    )
                                    .toLocaleString("en-IN", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                </td>
                                <td className="px-3 py-2 text-right text-sm font-bold text-gray-900">
                                  {journalDetails.lines
                                    .reduce(
                                      (sum, line) => sum + (line.credit || 0),
                                      0,
                                    )
                                    .toLocaleString("en-IN", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>

                        {/* Narration and Metadata */}
                        {journalDetails.narration && (
                          <div className="mt-4 p-3 bg-blue-50 rounded-md border border-blue-100">
                            <div className="text-xs text-blue-700 font-medium mb-1">
                              Narration
                            </div>
                            <div className="text-sm text-blue-900">
                              {journalDetails.narration}
                            </div>
                          </div>
                        )}

                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600">
                          {journalDetails.createdBy && (
                            <div>
                              <span className="font-medium">Created by:</span>{" "}
                              {typeof journalDetails.createdBy === "object"
                                ? journalDetails.createdBy.name || journalDetails.createdBy.email || "User"
                                : journalDetails.createdBy}{" "}
                              on{" "}
                              {new Date(
                                journalDetails.createdAt,
                              ).toLocaleString()}
                            </div>
                          )}
                          {journalDetails.updatedBy &&
                            (journalDetails.updatedBy?._id || journalDetails.updatedBy) !==
                              (journalDetails.createdBy?._id || journalDetails.createdBy) && (
                              <div>
                                <span className="font-medium">
                                  Last updated by:
                                </span>{" "}
                                {typeof journalDetails.updatedBy === "object"
                                  ? journalDetails.updatedBy.name || journalDetails.updatedBy.email || "User"
                                  : journalDetails.updatedBy}{" "}
                                on{" "}
                                {new Date(
                                  journalDetails.updatedAt,
                                ).toLocaleString()}
                              </div>
                            )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* No Journal Found Warning */}
                  {isExpanded && !journalDetails && (
                    <div className="p-4 border-b border-gray-200 bg-yellow-50">
                      <div className="flex items-center gap-2 text-yellow-700">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-sm">
                          Journal details not found. The journal might have been
                          deleted.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="p-4 bg-gray-50">
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleApprove(request)}
                        disabled={processing}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 text-sm font-medium cursor-pointer transition-colors"
                      >
                        <Check className="w-4 h-4" />
                        {processing
                          ? "Processing..."
                          : `Approve ${request.type === "delete" ? "& Delete" : ""}`}
                      </button>
                      <button
                        onClick={() => handleReject(request)}
                        disabled={processing}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 text-sm font-medium cursor-pointer transition-colors"
                      >
                        <X className="w-4 h-4" />
                        Reject Request
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      }
    />
  );
}
