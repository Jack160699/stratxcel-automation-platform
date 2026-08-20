/**
 * Registrar-Specific Step-by-Step DNS Guidance
 */

import type { RegistrarGuidance, SupportedRegistrar } from "../types.ts";

export const REGISTRAR_GUIDANCE_MAP: Record<SupportedRegistrar, RegistrarGuidance> = {
  godaddy: {
    key: "godaddy",
    name: "GoDaddy",
    steps: [
      "Log in to your GoDaddy account and open My Products.",
      "Scroll down to Domains and click DNS (or Manage DNS) next to your domain.",
      "In the DNS Records section, click Add New Record.",
      "Add the A record: Type = A, Name = @, Value = (stratxcel A IP), TTL = 1 Hour.",
      "Add the CNAME record: Type = CNAME, Name = www, Value = (stratxcel CNAME target), TTL = 1 Hour.",
      "Save both records. Delete any conflicting old A or CNAME records pointing elsewhere.",
      "Return to Stratxcel and click 'Verify My Domain'.",
    ],
    tips: [
      "GoDaddy usually updates DNS within 5–15 minutes, but can take up to 1 hour.",
      "If you see an existing 'Parked' A record, replace it with Stratxcel's A record.",
    ],
  },
  namecheap: {
    key: "namecheap",
    name: "Namecheap",
    steps: [
      "Log in to your Namecheap Dashboard and click Domain List.",
      "Find your domain and click Manage.",
      "Navigate to the Advanced DNS tab at the top.",
      "Under Host Records, click Add New Record.",
      "Add A Record: Type = A Record, Host = @, Value = (stratxcel A IP), TTL = Automatic.",
      "Add CNAME Record: Type = CNAME Record, Host = www, Target = (stratxcel CNAME target), TTL = Automatic.",
      "Click the green checkmark to save changes.",
      "Return to Stratxcel and click 'Verify My Domain'.",
    ],
    tips: [
      "Ensure Nameservers is set to 'Namecheap BasicDNS' on the Domain tab.",
      "Namecheap changes are typically active within 15 minutes.",
    ],
  },
  hostinger: {
    key: "hostinger",
    name: "Hostinger",
    steps: [
      "Log in to Hostinger hPanel and go to Domains.",
      "Select your domain name and click DNS / Nameservers in the left sidebar.",
      "Under Manage DNS Records, select Type A.",
      "Enter Name = @, Points to = (stratxcel A IP), TTL = 14400, then click Add Record.",
      "Select Type CNAME.",
      "Enter Name = www, Target = (stratxcel CNAME target), TTL = 14400, then click Add Record.",
      "Return to Stratxcel and click 'Verify My Domain'.",
    ],
    tips: [
      "Delete any default parking CNAME or A records created by Hostinger.",
    ],
  },
  cloudflare: {
    key: "cloudflare",
    name: "Cloudflare",
    steps: [
      "Log in to Cloudflare Dashboard and select your domain.",
      "Click DNS -> Records in the left navigation.",
      "Click Add record.",
      "Add A Record: Type = A, Name = @, IPv4 address = (stratxcel A IP), Proxy status = DNS only (Grey Cloud).",
      "Add CNAME Record: Type = CNAME, Name = www, Target = (stratxcel CNAME target), Proxy status = DNS only (Grey Cloud).",
      "Click Save on each record.",
      "Return to Stratxcel and click 'Verify My Domain'.",
    ],
    tips: [
      "IMPORTANT: Set Proxy status to 'DNS only' (Grey Cloud) during initial verification for SSL issuance.",
    ],
  },
  bigrock: {
    key: "bigrock",
    name: "BigRock",
    steps: [
      "Log in to your BigRock Control Panel.",
      "Go to Manage Orders -> List / Search Orders and select your domain.",
      "Scroll to the DNS Management section and click Manage DNS.",
      "Click Add A Record -> Host Name = (leave blank or @), Destination IPv4 = (stratxcel A IP) -> Add Record.",
      "Click Add CNAME Record -> Host Name = www, Value = (stratxcel CNAME target) -> Add Record.",
      "Return to Stratxcel and click 'Verify My Domain'.",
    ],
    tips: [
      "BigRock DNS changes generally propagate in 15–30 minutes across India.",
    ],
  },
  squarespace: {
    key: "squarespace",
    name: "Squarespace (Google Domains)",
    steps: [
      "Log in to your Squarespace account and open your Domains dashboard.",
      "Click your domain name, then click DNS Settings.",
      "Under Custom Records, click Add record.",
      "Set Type = A, Host = @, Data = (stratxcel A IP), then click Save.",
      "Set Type = CNAME, Host = www, Data = (stratxcel CNAME target), then click Save.",
      "Return to Stratxcel and click 'Verify My Domain'.",
    ],
  },
  bluehost: {
    key: "bluehost",
    name: "Bluehost",
    steps: [
      "Log in to Bluehost portal and click Domains in the menu.",
      "Click Manage next to your domain, then choose DNS.",
      "Scroll to the A (Host) section, click Add Record, set Host Record = @, Points to = (stratxcel A IP).",
      "Scroll to CNAME (Alias), click Add Record, set Host Record = www, Points to = (stratxcel CNAME target).",
      "Save your entries and return to Stratxcel to click 'Verify My Domain'.",
    ],
  },
  other: {
    key: "other",
    name: "Other Registrar / DNS Host",
    steps: [
      "Open your domain registrar or DNS management portal.",
      "Locate the DNS Management, Zone Editor, or DNS Records section.",
      "Add an A Record with Host/Name set to '@' pointing to the Stratxcel A record IP.",
      "Add a CNAME Record with Host/Name set to 'www' pointing to the Stratxcel CNAME target.",
      "Remove or replace any conflicting old records pointing to an old server or parking page.",
      "Save your records and return to Stratxcel to click 'Verify My Domain'.",
    ],
    tips: [
      "DNS propagation can take anywhere from a few minutes up to a few hours depending on TTL.",
    ],
  },
};
