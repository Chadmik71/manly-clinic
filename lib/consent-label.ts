/** Plain-language names for ConsentRecord.type, shown to clients. */
export function consentLabel(type: string): string {
  switch (type) {
    case "TREATMENT":
      return "Consent to treatment";
    case "HEALTH_INFO_STORAGE":
      return "Storing your health information";
    case "PRIVACY_POLICY":
      return "Privacy policy";
    case "MARKETING":
      return "Thank-you and review messages";
    default:
      return type.replace(/_/g, " ").toLowerCase();
  }
}
