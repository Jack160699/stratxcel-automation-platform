/**
 * Intent Classifier & Prompt Injection Defender
 *
 * Extracts commerce entities (category, color, budget), cart operations,
 * checkout requests, order inquiries, and neutralizes prompt injections.
 */

export interface ParsedUserIntent {
  intent:
    | "PRODUCT_SEARCH"
    | "ADD_TO_CART"
    | "VIEW_CART"
    | "CHECKOUT"
    | "ORDER_STATUS"
    | "BUSINESS_INFO"
    | "LEAD_CAPTURE"
    | "HUMAN_ESCALATION"
    | "GENERAL_QUERY";
  entities: {
    query?: string;
    category?: string;
    color?: string;
    maxPriceCents?: number;
    productIndex?: number; // e.g. "the second one" -> 1
    productId?: string;
    orderId?: string;
    name?: string;
    email?: string;
    phone?: string;
    requirement?: string;
  };
  isPromptInjection: boolean;
  sanitizedMessage: string;
}

export class IntentClassifier {
  public classify(rawMessage: string, previousContext?: ParsedUserIntent): ParsedUserIntent {
    const norm = rawMessage.toLowerCase().trim();

    // 1. Prompt Injection Defense
    const isPromptInjection =
      norm.includes("ignore previous instructions") ||
      norm.includes("ignore all instructions") ||
      norm.includes("system prompt") ||
      norm.includes("reveal secrets") ||
      norm.includes("api_key") ||
      norm.includes("service_role") ||
      norm.includes("<script") ||
      norm.includes("javascript:");

    // 2. Human Escalation Intent
    if (
      norm.includes("talk to a human") ||
      norm.includes("human representative") ||
      norm.includes("agent dispute") ||
      norm.includes("refund dispute") ||
      norm.includes("speak with manager")
    ) {
      return {
        intent: "HUMAN_ESCALATION",
        entities: {},
        isPromptInjection,
        sanitizedMessage: rawMessage.slice(0, 500),
      };
    }

    // 3. Checkout Intent
    if (norm === "checkout" || norm.includes("proceed to checkout") || norm.includes("buy now") || norm.includes("pay now")) {
      return {
        intent: "CHECKOUT",
        entities: {},
        isPromptInjection,
        sanitizedMessage: rawMessage.slice(0, 500),
      };
    }

    // 4. Cart View Intent
    if (
      norm.includes("view cart") ||
      norm.includes("show cart") ||
      norm.includes("what's in my cart") ||
      norm.includes("what is in my cart") ||
      norm.includes("in my cart") ||
      norm === "cart"
    ) {
      return {
        intent: "VIEW_CART",
        entities: {},
        isPromptInjection,
        sanitizedMessage: rawMessage.slice(0, 500),
      };
    }

    // 5. Add to Cart Intent
    if (norm.includes("add") && (norm.includes("cart") || norm.includes("second") || norm.includes("first") || norm.includes("this"))) {
      let productIndex = 0;
      if (norm.includes("second") || norm.includes("2nd")) productIndex = 1;
      if (norm.includes("third") || norm.includes("3rd")) productIndex = 2;

      return {
        intent: "ADD_TO_CART",
        entities: { productIndex },
        isPromptInjection,
        sanitizedMessage: rawMessage.slice(0, 500),
      };
    }

    // 6. Order Status Intent
    if (norm.includes("where is my order") || norm.includes("order status") || norm.includes("track order") || norm.includes("my order")) {
      const orderMatch = rawMessage.match(/ord_[a-zA-Z0-9_]+/);
      return {
        intent: "ORDER_STATUS",
        entities: { orderId: orderMatch ? orderMatch[0] : undefined },
        isPromptInjection,
        sanitizedMessage: rawMessage.slice(0, 500),
      };
    }

    // 7. Lead / Consultation Intent
    if (norm.includes("consultation") || norm.includes("book") || norm.includes("hire") || norm.includes("contact us") || norm.includes("quote")) {
      const emailMatch = rawMessage.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      const phoneMatch = rawMessage.match(/\+?[0-9\s-]{10,14}/);

      return {
        intent: "LEAD_CAPTURE",
        entities: {
          email: emailMatch ? emailMatch[0] : undefined,
          phone: phoneMatch ? phoneMatch[0].trim() : undefined,
          requirement: rawMessage,
        },
        isPromptInjection,
        sanitizedMessage: rawMessage.slice(0, 500),
      };
    }

    // 8. Business Info Intent
    if (norm.includes("hours") || norm.includes("address") || norm.includes("location") || norm.includes("phone number") || norm.includes("contact")) {
      return {
        intent: "BUSINESS_INFO",
        entities: {},
        isPromptInjection,
        sanitizedMessage: rawMessage.slice(0, 500),
      };
    }

    // 9. Product Search & Attribute Extraction
    const priceMatch = norm.match(/(?:under|below|less than|max|₹|\$)\s*([0-9,]+)/);
    let maxPriceCents = priceMatch ? parseInt(priceMatch[1].replace(/,/g, ""), 10) * 100 : undefined;

    // Follow-up context handling: "Only under 2000" inheriting previous search category/color
    if (!maxPriceCents && previousContext?.entities.maxPriceCents) {
      maxPriceCents = previousContext.entities.maxPriceCents;
    }

    let color: string | undefined;
    const colors = ["black", "white", "navy", "blue", "red", "green", "beige", "gold", "silver", "brown", "grey", "gray"];
    for (const c of colors) {
      if (norm.includes(c)) {
        color = c;
        break;
      }
    }
    if (!color && previousContext?.entities.color) {
      color = previousContext.entities.color;
    }

    let category: string | undefined;
    const categories = ["hoodie", "shirt", "t-shirt", "trouser", "trousers", "pants", "suit", "jacket", "coat", "shoes", "accessory", "silk"];
    for (const cat of categories) {
      if (norm.includes(cat)) {
        category = cat;
        break;
      }
    }
    if (!category && previousContext?.entities.category) {
      category = previousContext.entities.category;
    }

    if (
      category ||
      color ||
      maxPriceCents ||
      norm.includes("product") ||
      norm.includes("show") ||
      norm.includes("find") ||
      norm.includes("need") ||
      norm.includes("recommend") ||
      norm.includes("suggest") ||
      norm.includes("coffee")
    ) {
      let queryStr = "";
      if (category) {
        queryStr = category;
      } else if (norm.includes("coffee")) {
        queryStr = "coffee";
      } else if (color) {
        queryStr = color;
      }

      return {
        intent: "PRODUCT_SEARCH",
        entities: {
          query: queryStr,
          category,
          color,
          maxPriceCents,
        },
        isPromptInjection,
        sanitizedMessage: rawMessage.slice(0, 500),
      };
    }

    return {
      intent: "GENERAL_QUERY",
      entities: {},
      isPromptInjection,
      sanitizedMessage: rawMessage.slice(0, 500),
    };
  }
}

export const intentClassifier = new IntentClassifier();
