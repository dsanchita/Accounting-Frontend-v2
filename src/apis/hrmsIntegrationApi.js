import { API } from "./api";

export const getHrmsIntegrationAdminDataApi = (companyId) =>
  API.get(`/integrations/hrms/admin/${companyId}`);

export const getHrmsIntegrationCompanyDataApi = (companyId) =>
  API.get(`/integrations/hrms/company/${companyId}`);

export const getHrmsIntegrationMappingsApi = (companyId) =>
  API.get(`/integrations/hrms/admin/${companyId}/mappings`);

export const saveHrmsIntegrationMappingsApi = (companyId, payload) =>
  API.put(`/integrations/hrms/admin/${companyId}/mappings`, payload);

export const getHrmsEmployeePayablesApi = (companyId) =>
  API.get("/integrations/hrms/payables", { params: { companyId } });

export const getHrmsEmployeePayableReconciliationApi = (companyId) =>
  API.get("/integrations/hrms/reconciliation", { params: { companyId } });

export const createHrmsSettlementApi = (payload) =>
  API.post("/integrations/hrms/settlements", payload);

export const getHrmsSettlementsApi = (companyId) =>
  API.get("/integrations/hrms/settlements", { params: { companyId } });

export const reverseHrmsSettlementApi = (settlementId, payload) =>
  API.post(`/integrations/hrms/settlements/${settlementId}/reversals`, payload);
