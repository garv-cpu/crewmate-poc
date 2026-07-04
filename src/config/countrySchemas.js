export const COUNTRY_SCHEMAS = {
  INDIA_CDC: {
    country: "India",
    authority: "DG Shipping / DGMA",
    documentType: "CDC",
    requiredFields: [
      "name",
      "documentNumber",
      "dateOfBirth",
      "issueDate",
      "expiryDate",
      "nationality"
    ],
    patterns: {
      documentNumber: /^[A-Z0-9/-]{5,25}$/i,
      dateOfBirth: /^\d{4}-\d{2}-\d{2}$/,
      issueDate: /^\d{4}-\d{2}-\d{2}$/,
      expiryDate: /^\d{4}-\d{2}-\d{2}$/
    }
  },

  PHILIPPINES_SRB: {
    country: "Philippines",
    authority: "MARINA",
    documentType: "SRB",
    requiredFields: [
      "name",
      "documentNumber",
      "dateOfBirth",
      "issueDate",
      "expiryDate",
      "nationality"
    ],
    patterns: {
      documentNumber: /^[A-Z0-9/-]{5,25}$/i,
      dateOfBirth: /^\d{4}-\d{2}-\d{2}$/,
      issueDate: /^\d{4}-\d{2}-\d{2}$/,
      expiryDate: /^\d{4}-\d{2}-\d{2}$/
    }
  },

  UNKNOWN: {
    country: "Unknown",
    authority: "Unknown",
    documentType: "Unknown",
    requiredFields: ["name", "documentNumber"],
    patterns: {}
  }
};