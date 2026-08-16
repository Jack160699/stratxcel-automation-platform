# StratXcel Plan Engine

## 1. Customer Plan Architecture

The Plan Engine converts prioritized business requirements into exactly **TWO customer-facing plan tiers**:

### 1. Recommended Premium Plan
- **Philosophy**: "What this business actually needs to achieve high growth."
- **Composition**: All required, high, and medium priority services.
- **Quality**: Premium AI models (`gemini-3.6-pro`), multiple revision passes, dedicated critic evaluation, faster SLAs, and full delivery quantity.

### 2. Standard Alternative Plan
- **Philosophy**: "Lower-cost essential foundation package."
- **Composition**: Only required and top-priority services.
- **Tradeoffs**: Clearly defined quantity differences (e.g. 4 updates vs 12 updates), standard model quality (`gemini-3.6-flash`), and bi-weekly cadence.

---

## 2. Transparent Tradeoff Matrix

The customer UI displays a clear comparison:
- **Price Difference** (in ₹/month)
- **Quantity Differences** per service
- **Quality Differences** (standard vs premium specs)
- **Frequency Differences** (weekly vs bi-weekly)
- **Excluded Capabilities**
