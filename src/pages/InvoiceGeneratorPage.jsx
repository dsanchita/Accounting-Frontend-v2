import { useEffect, useState } from "react";
import { getClientsApi } from "../apis/clientApi";
import { useAuth } from "../contexts/AuthContext";
import EmptyComponent from "../components/EmptyComponent";
import { X } from "lucide-react";
import { formatCamelCase, formatCurrency } from "../utils/formatUtil";
import { getallhsn } from "../apis/hsnapi"; 

const today = new Date().toISOString().split("T")[0];



export default function InvoiceGeneratorPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [hsmList, setHsmList] = useState([]);

  useEffect(() => {
    async function loadHsnData() {
      try {
        // Always fetch all HSN codes (global master data) - no companyId filter
        const res = await getallhsn();
        setHsmList(res.data);
      } catch (err) {
        console.error("HSM load error:", err);
      }
    }
    loadHsnData();
  }, []);
 



  const [form, setForm] = useState({
    invoiceDate: today,
    dueDate: "",
    referenceDate: today,
    currency: "INR",
    amountDue: 0,
    paymentMode: "Bank-Transfer",
    billTo: "",
    shipTo: "",
    items: [],
    totalTaxableValue: 0,
    totalCGSTAmount: 0,
    totalSGSTAmount: 0,
    totalIGSTAmount: 0,
    poreferencevalue: "",
    withSignature: false,
  });
  const [fullData, setFullData] = useState({
    billTo: {},
    shipTo: {},
  });
  const [clients, setClients] = useState([]);

  useEffect(() => {
    if (form.billTo) {
      const chosenClient = clients.find((c) => c._id === form.billTo);

      if (form.sameAsBillTo) {
        setFullData((prev) => ({
          ...prev,
          billTo: chosenClient,
          shipTo: chosenClient,
        }));
        handleChange({ target: { name: "shipTo", value: form.billTo } });
      } else {
        setFullData((prev) => ({
          ...prev,
          billTo: chosenClient,
        }));
      }
    }
    if (form.shipTo) {
      setFullData((prev) => ({
        ...prev,
        shipTo: clients.find((c) => c._id === form.shipTo),
      }));
    }
  }, [form.billTo, form.shipTo]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const getTotalAmount = () => {
    return form.items
      .reduce((sum, item) => sum + (item.total || 0), 0)
      .toFixed(2);
  };

  const handleAddItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          description: "",
          hsnSac: "",
          quantity: 1,
          rate: 0,
          taxableValue: 0,
          gstRate: 0,
          gstAmount: 0,
          total: 0,
        },
      ],
    }));
  };

  const handleRemoveItem = (index) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  useEffect(() => {
    let taxableValue = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    form.items.forEach((item) => {
      taxableValue += item.taxableValue || 0;
      const gstAmount = item.gstAmount || 0;

      if (form.billTo.stateCode === "19" && form.shipTo.stateCode === "19") {
        cgst += Math.round(gstAmount / 2);
        sgst += Math.round(gstAmount / 2);
      } else {
        igst += Math.round(gstAmount);
      }
    });

    const totalAmount = Math.round(taxableValue + cgst + sgst + igst);

    setForm((prev) => ({
      ...prev,
      totalTaxableValue: parseFloat(taxableValue.toFixed(2)),
      amountDue: parseFloat(totalAmount.toFixed(2)),
      totalCGSTAmount: parseFloat(cgst.toFixed(2)),
      totalSGSTAmount: parseFloat(sgst.toFixed(2)),
      totalIGSTAmount: parseFloat(igst.toFixed(2)),
    }));
  }, [form.items, form.billTo.stateCode, form.shipTo.stateCode]);

  const handleItemChange = (index, field, value) => {
    const newItems = [...form.items];
    newItems[index][field] = value;

    if (field === "quantity" || field === "rate" || field === "gstRate") {
      const quantity = parseFloat(newItems[index].quantity) || 0;
      const rate = parseFloat(newItems[index].rate) || 0;
      const gstRate = parseFloat(newItems[index].gstRate) || 0;

      const taxableValue = parseFloat((quantity * rate).toFixed(2));
      const gstAmount = Math.round((taxableValue * gstRate) / 100);
      const total = Math.round(taxableValue + gstAmount);

      newItems[index].taxableValue = taxableValue;
      newItems[index].gstAmount = gstAmount;
      newItems[index].total = total;
    }

    setForm((prev) => ({ ...prev, items: newItems }));
  };

  useEffect(() => {
    const controller = new AbortController();

    async function getAllClients() {
      try {
        setLoading(true);
        // Always fetch all clients (global master data) - no companyId filter
        const response = await getClientsApi();
        setClients(response?.data || []);
      } catch (error) {
        console.error("fetch error:", error);
        toast.error("Error getting clients");
      } finally {
        setLoading(false);
      }
    }

    getAllClients();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (form.invoiceDate) {
      const invoiceDate = new Date(form.invoiceDate);
      const dueDate = new Date(invoiceDate);
      dueDate.setDate(invoiceDate.getDate() + 7);

      const formattedDueDate = dueDate.toISOString().split("T")[0];
      setForm((prev) => ({
        ...prev,
        dueDate: formattedDueDate,
      }));
    }
  }, [form.invoiceDate]);

 useEffect(() => {
   // Only auto-fill if client is selected & HSM list is loaded
   if (!fullData.billTo?._id || hsmList.length === 0) return;

   const clientHsnCodes = fullData.billTo.hsnCodes || [];

   // For every HSN code, find all matching HSM entries
   let generatedItems = [];

   clientHsnCodes.forEach((hsnCode) => {
     const matchingServices = hsmList.filter(
       (item) => item.hsnCode === hsnCode
     );

     matchingServices.forEach((service) => {
       const quantity = 1;
       const rate = 1000;
       const gstRate = service.igst || 0;

       const taxableValue = quantity * rate;
       const gstAmount = Math.round((taxableValue * gstRate) / 100);
       const total = taxableValue + gstAmount;

       generatedItems.push({
         description: service.serviceType,
         hsnSac: service.hsnCode,
         quantity,
         rate,
         taxableValue,
         gstRate,
         gstAmount,
         total,
       });
     });

   });

   setForm((prev) => ({
     ...prev,
     items: generatedItems,
   }));
 }, [fullData.billTo, hsmList]);

  return (
    <div className="min-h-screen bg-linear-to-br from-neutral-50 to-neutral-100">
      {/* Header*/}
      <div className="bg-white shadow p-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">
          Invoice Generator
        </h1>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6">
        {/* Company Details Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
          <div className="bg-linear-to-r from-neutral-800 to-neutral-700 px-6 py-4">
            <p className="font-semibold text-lg text-white tracking-wide">
              Company Details
            </p>
          </div>
          <div className="p-6 space-y-2">
            <p className="font-bold text-neutral-900 text-lg">
              Nexucon Consultancy Services Pvt Ltd
            </p>
            <p className="text-neutral-600 leading-relaxed">
              Methopara, 60/N/3, Madhyamgram, North Twenty Four Parganas, West
              Bengal, 700132
            </p>
            <div className="flex flex-wrap gap-4 pt-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  GSTIN:
                </span>
                <span className="font-mono text-sm text-neutral-900 bg-neutral-100 px-3 py-1 rounded-lg">
                  19AAICN7264L1ZR
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  PAN:
                </span>
                <span className="font-mono text-sm text-neutral-900 bg-neutral-100 px-3 py-1 rounded-lg">
                  AAICN7264L
                </span>
              </div>
            </div>
          </div>
        </div>


        <div className="bg-white shadow-lg rounded-2xl border border-neutral-200 overflow-hidden">
          {/* Card Header */}
          <div className="bg-linear-to-r from-neutral-800 to-neutral-700 px-6 py-4">
            <h2 className="text-lg font-semibold text-white tracking-wide">
              Invoice Details
            </h2>
          </div>
          
          {/* Form Content */}
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Invoice No */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                  Invoice No
                </label>
                <input
                  name="invoiceNo"
                  readOnly
                  className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 text-neutral-900 font-medium focus:outline-none focus:border-neutral-400 transition-colors"
                  placeholder="Auto-generated"
                />
              </div>

              {/* Buyer PO Reference */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                  Buyer's Order Reference
                </label>
                <input
                  name="poreferencevalue"
                  value={form.poreferencevalue || ""}
                  onChange={handleChange}
                  className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-white text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 transition-all"
                  placeholder="Enter PO reference"
                />
              </div>

              {/* Payment Mode */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                  Payment Mode
                </label>
                <select
                  name="paymentMode"
                  className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-white text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 transition-all cursor-pointer"
                >
                  <option value="Bank-Transfer">Bank Transfer</option>
                  <option value="Credit-Card">Credit Card</option>
                  <option value="Debit-Card">Debit Card</option>
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>

              {/* Amount Due */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                  Amount Due
                </label>
                <div className="flex items-center gap-2 border-2 border-neutral-200 rounded-xl bg-neutral-50 p-3">
                  <span
                    className="text-neutral-600 font-bold text-sm"
                    id="currency-label"
                  >
                    INR
                  </span>
                  <input
                    name="amountDue"
                    readOnly
                    className="w-full bg-transparent focus:outline-none text-neutral-900 font-medium"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Invoice Date */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                  Invoice Date
                </label>
                <input
                  type="date"
                  name="invoiceDate"
                  value={form.invoiceDate}
                  onChange={handleChange}
                  className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-white text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 transition-all"
                />
              </div>

              {/* Due Date */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                  Due Date
                </label>
                <input
                  type="date"
                  name="dueDate"
                  className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-white text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 transition-all"
                />
              </div>

              {/* Currency */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                  Currency
                </label>
                <select
                  name="currency"
                  className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-white text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 transition-all cursor-pointer"
                >
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="GBP">GBP - British Pound</option>
                  <option value="INR">INR - Indian Rupee</option>
                  <option value="JPY">JPY - Japanese Yen</option>
                  <option value="CAD">CAD - Canadian Dollar</option>
                  <option value="AUD">AUD - Australian Dollar</option>
                </select>
              </div>

              {/* Reference Date */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                  Reference Date
                </label>
                <input
                  type="date"
                  name="referenceDate"
                  value={form.referenceDate}
                  onChange={handleChange}
                  className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-white text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 transition-all"
                />
              </div>
            </div>
          </div>
        </div>
        {/* Client Details Card */}
        <div className="bg-white shadow-lg rounded-2xl border border-neutral-200 overflow-hidden">
          {/* Header */}
          <div className="bg-linear-to-r from-neutral-800 to-neutral-700 px-6 py-4">
            <h2 className="text-lg font-semibold text-white tracking-wide flex items-center gap-2">
              Client Details
            </h2>
          </div>

          {/* Content */}
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* BILL TO */}
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
                <p className="text-neutral-700 font-semibold text-lg mb-3">
                  Bill To
                </p>

                <div className="space-y-4">
                  {/* Select Client */}
                  <div>
                    <label className="font-semibold text-sm text-neutral-600">
                      Select Client
                    </label>
                    <select
                      name="billTo"
                      value={form.billTo}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <option value="">Select client...</option>
                      {clients.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.clientCode.toString().padStart(3, "0")} -{" "}
                          {c.clientName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {fullData.billTo?._id && (
                  <ClientDetails data={fullData.billTo} />
                )}
              </div>

              {/* SHIP TO */}
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-neutral-700 font-semibold text-lg">
                    Ship To
                  </p>

                  <label className="flex items-center gap-2 text-sm text-neutral-600">
                    <input
                      type="checkbox"
                      checked={form.sameAsBillTo}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          sameAsBillTo: e.target.checked,
                          shipTo: e.target.checked ? form.billTo : form.shipTo,
                        })
                      }
                      className="accent-neutral-800"
                    />
                    Same as Bill To
                  </label>
                </div>

                <div className="space-y-4">
                  {/* Select Client */}
                  <div className="space-y-4">
                    {/* Select Client */}
                    <div>
                      <label className="font-semibold text-sm text-neutral-600">
                        Select Client
                      </label>
                      <select
                        name="shipTo"
                        value={form.shipTo}
                        onChange={handleChange}
                        className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                      >
                        <option value="">Select client...</option>
                        {clients.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.clientCode.toString().padStart(3, "0")} -{" "}
                            {c.clientName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                {fullData.shipTo?._id && (
                  <ClientDetails data={fullData.shipTo} />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ITEMS CARD */}
        <div className="bg-white shadow-lg rounded-2xl border border-neutral-200 overflow-hidden">
          {/* Header */}
          <div className="bg-linear-to-r flex justify-between from-neutral-800 to-neutral-700 px-6 py-4">
            <h2 className="text-lg font-semibold text-white tracking-wide flex items-center gap-2">
              Items
            </h2>

            <button
              onClick={handleAddItem}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-neutral-700 border border-white text-white rounded-md text-sm hover:bg-neutral-800 cursor-pointer"
            >
              Add Item
            </button>
          </div>

          <div className="border-b mb-3"></div>

          {/* TABLE */}
          {form.items.length > 0 ? (
            <div className="overflow-x-auto rounded-xl px-1 border border-neutral-200">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50">
                  <tr className="text-left">
                    <th className="font-bold px-4 py-2 min-w-[200px]">
                      Description
                    </th>
                    <th className="font-bold px-4 py-2 min-w-[100px]">
                      HSN/SAC
                    </th>
                    <th className="font-bold px-4 py-2 min-w-20 text-right">
                      Qty
                    </th>
                    <th className="font-bold px-4 py-2 min-w-[100px] text-right">
                      Rate
                    </th>
                    <th className="font-bold px-4 py-2 min-w-[120px] text-right">
                      Taxable Value
                    </th>
                    <th className="font-bold px-4 py-2 min-w-20 text-right">
                      GST %
                    </th>
                    <th className="font-bold px-4 py-2 min-w-[120px] text-right">
                      GST Amount
                    </th>
                    <th className="font-bold px-4 py-2 min-w-[120px] text-right">
                      Total
                    </th>
                    <th className="font-bold px-4 py-2 min-w-[60px]">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {form.items.length > 0 &&
                    form.items.map((item, index) => (
                      <tr key={index} className="border-t hover:bg-neutral-50">
                        {/* DESCRIPTION */}
                        <td className="p-3 align-top">
                          <input
                            value={item.description}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "description",
                                e.target.value
                              )
                            }
                            placeholder="Service description..."
                            className="w-full p-2 border rounded-lg bg-white"
                          />
                        </td>

                        {/* HSN/SAC */}
                        <td className="p-3 align-top">
                          <select
                            value={item.hsnSac}
                            onChange={(e) =>
                              handleItemChange(index, "hsnSac", e.target.value)
                            }
                            className="w-full p-2 border rounded-lg bg-white"
                          >
                            <option value="">Select HSN</option>

                            {/* Client's HSN Codes */}
                            {fullData.billTo?.hsnCodes?.map((hsn, hIndex) => (
                              <option key={hIndex} value={hsn}>
                                {hsn}
                              </option>
                            ))}

                            <option value="Other">Other...</option>
                          </select>

                          {/* Custom input if “Other” is selected */}
                          {item.hsnSac === "Other" && (
                            <input
                              value={item.customHsnSac || ""}
                              onChange={(e) => {
                                const newItems = [...form.items];
                                newItems[index].customHsnSac = e.target.value;
                                setForm((prev) => ({
                                  ...prev,
                                  items: newItems,
                                }));
                              }}
                              placeholder="Enter custom HSN"
                              className="w-full mt-2 p-2 border rounded-lg bg-white"
                            />
                          )}
                        </td>

                        {/* QTY */}
                        <td className="p-3">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "quantity",
                                e.target.value
                              )
                            }
                            className="w-full p-2 border rounded-lg text-right"
                          />
                        </td>

                        {/* RATE */}
                        <td className="p-3">
                          <input
                            type="number"
                            value={item.rate}
                            onChange={(e) =>
                              handleItemChange(index, "rate", e.target.value)
                            }
                            className="w-full p-2 border rounded-lg text-right"
                          />
                        </td>

                        {/* TAXABLE VALUE */}
                        <td className="p-3 text-right font-medium">
                          {item.taxableValue?.toFixed(2) || "0.00"}
                        </td>

                        {/* GST RATE */}
                        <td className="p-3">
                          <input
                            type="number"
                            value={item.gstRate}
                            onChange={(e) =>
                              handleItemChange(index, "gstRate", e.target.value)
                            }
                            className="w-full p-2 border rounded-lg text-right"
                          />
                        </td>

                        {/* GST AMOUNT */}
                        <td className="p-3 text-right font-medium">
                          {item.gstAmount?.toFixed(2) || "0.00"}
                        </td>

                        {/* TOTAL */}
                        <td className="p-3 text-right font-semibold text-blue-700">
                          {item.total?.toFixed(2) || "0.00"}
                        </td>

                        {/* DELETE BUTTON */}
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleRemoveItem(index)}
                            className="text-red-600 hover:text-red-800 text-lg"
                          >
                            <X />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center p-2 bg-neutral-100 rounded-xl">
              <EmptyComponent
                title={"No Items added yet"}
                subtitle={"Click 'Add Item' to get started."}
              />
            </div>
          )}

          {/* TOTAL BOX */}
          <div className="flex justify-end mt-4">
            <div className="bg-neutral-50 m-3 p-4 min-w-[350px] rounded-xl text-right border border-neutral-200 space-y-2">
              {/* TOTAL INVOICE AMOUNT */}
              <h3 className="text-lg font-bold text-neutral-700">
                Total:{" "}
                {formatCurrency(getTotalAmount(), "en-IN", form.currency)}
              </h3>

              {/* TOTAL GST PAID */}
              <p className="text-sm font-semibold text-neutral-600">
                Total GST Paid:{" "}
                {formatCurrency(
                  (form.totalCGSTAmount || 0) +
                    (form.totalSGSTAmount || 0) +
                    (form.totalIGSTAmount || 0),
                  "en-IN",
                  form.currency
                )}
              </p>
            </div>
          </div>
        </div>

        {/* BANK & AMOUNT DETAILS CARD */}
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden mb-6">
          {/* Header */}
          <div className="bg-linear-to-r from-neutral-800 to-neutral-700 px-6 py-4">
            <h2 className="text-lg font-semibold text-white tracking-wide flex items-center gap-2">
              Bank & Amount Details
            </h2>
          </div>

          {/* Content */}
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* BANK DETAILS */}
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5">
                <p className="text-neutral-700 font-semibold text-lg mb-4">
                  Bank Details
                </p>

                <div className="space-y-4">
                  {/* Bank Name */}
                  <div>
                    <label className="text-sm font-semibold text-neutral-600">
                      Bank Name
                    </label>
                    <p className="mt-1 text-neutral-800 font-medium">
                      ICICI Bank
                    </p>
                  </div>

                  {/* Account Name */}
                  <div>
                    <label className="text-sm font-semibold text-neutral-600">
                      Account Name
                    </label>
                    <p className="mt-1 text-neutral-800 font-medium">
                      NEXUCON CONSULTANCY SERVICES PRIVATE
                    </p>
                  </div>

                  {/* Account No + IFSC */}
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex-1">
                      <label className="text-sm font-semibold text-neutral-600">
                        Account Number
                      </label>
                      <p className="mt-1 text-neutral-800 font-medium">
                        128005500629
                      </p>
                    </div>

                    <div className="flex-1">
                      <label className="text-sm font-semibold text-neutral-600">
                        IFSC Code
                      </label>
                      <p className="mt-1 text-neutral-800 font-medium">
                        ICIC0001280
                      </p>
                    </div>
                  </div>

                  {/* Branch */}
                  <div>
                    <label className="text-sm font-semibold text-neutral-600">
                      Branch
                    </label>
                    <p className="mt-1 text-neutral-800 font-medium">
                      Baranagar
                    </p>
                  </div>
                </div>
              </div>

              {/* AMOUNT DETAILS */}
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5">
                <p className="text-neutral-700 font-semibold text-lg mb-4">
                  Amount Details
                </p>

                <div className="space-y-4">
                  {/* Total Taxable Value */}
                  <div>
                    <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                      Total Taxable Value
                    </label>
                    <input
                      name="totalTaxableValue"
                      value={form.totalTaxableValue.toFixed(2)}
                      readOnly
                      className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 text-neutral-900 font-medium focus:outline-none"
                      type="number"
                    />
                  </div>

                  {/* Value in Words */}
                  {/* <div>
                      <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                        Value in Words
                      </label>
                      <textarea
                        value={valueInWords}
                        readOnly
                        rows={2}
                        className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 text-neutral-900 font-medium focus:outline-none"
                      />
                    </div> */}

                  {/* CGST + SGST */}
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                        Total CGST
                      </label>
                      <input
                        name="totalCGSTAmount"
                        value={form.totalCGSTAmount.toFixed(2)}
                        readOnly
                        type="number"
                        className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 text-neutral-900 font-medium focus:outline-none"
                      />
                    </div>

                    <div className="flex-1">
                      <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                        Total SGST
                      </label>
                      <input
                        name="totalSGSTAmount"
                        value={form.totalSGSTAmount.toFixed(2)}
                        readOnly
                        type="number"
                        className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 text-neutral-900 font-medium focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* IGST */}
                  <div>
                    <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                      Total IGST
                    </label>
                    <input
                      name="totalIGSTAmount"
                      value={form?.totalIGSTAmount.toFixed(2)}
                      readOnly
                      type="number"
                      className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 text-neutral-900 font-medium focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* PDF GENERATION OPTIONS */}
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden mb-6">
          {/* Header */}
          <div className="bg-linear-to-r from-neutral-800 to-neutral-700 px-6 py-4">
            <h2 className="text-lg font-semibold text-white tracking-wide flex items-center gap-2">
              PDF Generation Options
            </h2>
          </div>

          {/* Content */}
          <div className="p-6">
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5">
              <div className="flex items-center justify-between">
                {/* Switch + Label */}
                <div className="flex items-center gap-3">
                  {/* Toggle Switch */}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={form.withSignature}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          withSignature: e.target.checked,
                        }))
                      }
                    />
                    <div
                      className="w-11 h-6 bg-neutral-300 peer-focus:outline-none 
                 rounded-full peer peer-checked:bg-blue-600 
                 peer-checked:after:translate-x-full 
                 peer-checked:after:border-white after:content-[''] 
                 after:absolute after:top-0.5 after:left-0.5 
                 after:bg-white after:border-neutral-300 
                 after:border after:rounded-full after:h-5 after:w-5 
                 after:transition-all"
                    ></div>
                  </label>

                  <p className="text-neutral-800 font-medium text-base">
                    Include Digital Signature
                  </p>
                </div>

                {/* Status Chip */}
                <span
                  className={`px-3 py-1 text-sm rounded-full font-medium ${
                    form.withSignature
                      ? "bg-green-100 text-green-700 border border-green-300"
                      : "bg-neutral-200 text-neutral-700 border border-neutral-300"
                  }`}
                >
                  {form.withSignature ? "With Signature" : "Without Signature"}
                </span>
              </div>
            </div>
          </div>
        </div>
        {/* ACTION BUTTONS SECTION */}
        <div className="flex flex-col items-center justify-center mt-6">
          {/* Generate Invoice Button */}
          <div className="mb-4">
            

            <button
              type="submit"
              disabled={loading}
              className={`px-10 py-3 text-lg font-semibold rounded-xl text-white 
        transition-all shadow-md
        bg-linear-to-r from-blue-500 to-blue-400 cursor-pointer
        ${loading ? "opacity-50 cursor-not-allowed" : "hover:shadow-lg"}
      `}
            >
              {loading ? "Generating..." : "Generate Invoice"}
            </button>
          </div>
        </div>
      </div>

    </div>
    

  );
}

const ClientDetails = ({ data }) => {
  return (
    <div className="w-full flex flex-col gap-1 mt-1 p-2 border border-neutral-200 rounded-lg">
      {["clientName", "clientAddress", "stateCode", "pinCode"].map(
        (key, index) =>
          data[key] && (
            <div
              key={index}
              className="grid grid-cols-[1fr_4fr] items-center w-full"
            >
              <label className="font-semibold text-sm text-neutral-600">
                {formatCamelCase(key)}
              </label>
              <p className="flex-1 bg-neutral-100 border border-neutral-100 p-2 rounded-xl">
                {data[key]}
              </p>
            </div>
          )
      )}
    </div>
  );
};
