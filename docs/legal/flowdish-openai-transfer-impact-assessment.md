# Flowdish OpenAI Transfer Impact Assessment

**Document owner:** Flowdish Privacy Lead  
**Version:** 2026-10-02  
**Status:** Operational assessment pending final solicitor review  
**Review frequency:** Annually and on any material provider, model, data-flow, retention, legal or security change

## 1. Decision

Flowdish may use the OpenAI API for the Enterprise AI features described below, provided the controls and outstanding actions in this assessment remain in place.

The direct contractual provider for an EEA customer is OpenAI Ireland Ltd. OpenAI may make onward transfers to affiliates and subprocessors outside the EEA. OpenAI's Data Processing Addendum states that these onward transfers will use European Commission Standard Contractual Clauses, an adequacy decision or another lawful mechanism.

The assessed processing is limited operational document extraction and drafting. Flowdish does not intend to send special-category data, payment-card data, bank details, information about children or data used to make legal or similarly significant decisions about individuals. With the controls below, the residual risk is assessed as **low to moderate and acceptable for launch**, subject to legal review.

## 2. Parties and roles

| Party | Role | Responsibilities |
| --- | --- | --- |
| Restaurant customer | Controller | Lawful basis, user authorisation, source-document handling, data accuracy and review |
| Flowdish | Processor for restaurant operational content; independent controller for its own account, security and billing data | Data minimisation, security, customer instructions, vendor management and user controls |
| OpenAI Ireland Ltd. | Subprocessor for Flowdish customer content | API processing under the OpenAI Services Agreement and DPA |
| OpenAI affiliates and listed providers | Further subprocessors | Infrastructure and supporting processing under OpenAI's DPA and subprocessor terms |

## 3. Processing covered

### Enterprise AI features

- Delivery-docket extraction
- Supplier price-list extraction
- POS and Z-read extraction
- Voice-transcript interpretation for waste and prep drafts
- Prep-time estimates
- Dashboard briefings
- SOP drafting and translation

HACCP Core and Kitchen Pro are outside the AI document-processing scope unless their subscribed feature set changes. Browser speech recognition and spoken SOP playback are also outside this transfer where no transcript is sent to the OpenAI API.

### Purpose

Convert kitchen documents or user-provided text into structured drafts that a user reviews before saving. AI output supports operational entry; it does not make decisions about an individual's employment, credit, health, legal rights or access to services.

### Data categories

Intended data:

- Supplier company name and supplier SKU
- Product descriptions, quantities, pack sizes and prices
- VAT codes and totals
- Docket, invoice or order reference
- Delivery date, batch code and expiry date
- Restaurant item names and recipe/prep information
- User voice transcript describing a kitchen record

Personal data that may appear incidentally:

- Staff, driver, supplier contact or sole-trader name
- Business email address or telephone number
- Customer or account reference that may be linkable to a person
- Handwritten name or signature if incorrectly included in a selected area

Prohibited data:

- Payment-card or banking information
- Special-category data
- Information about children
- Government identifiers
- Personal information unrelated to the operational task

## 4. Data flow

1. A user selects a Flowdish Enterprise AI feature.
2. For photographs, the user selects the operational areas in a browser privacy preview.
3. The browser creates a flattened image containing only the selected areas; unselected areas are excluded.
4. For supported text documents, Flowdish extracts and filters operational text before submission.
5. Flowdish sends a stateless API request to OpenAI with storage disabled.
6. OpenAI returns structured output and token-usage metadata.
7. Flowdish discards temporary parsing content and displays a draft for human review.
8. Only user-approved operational records are saved in the Flowdish database.

Flowdish stores AI usage metadata including provider, model, feature, token totals and estimated cost. It does not intentionally store the raw AI prompt, original photograph or raw AI response in the usage log.

## 5. Necessity and proportionality

AI processing is used because poor-quality, varied kitchen documents cannot be read reliably by fixed-layout parsers alone. The processing reduces manual entry and transcription errors. It is optional at product-tier level and is not needed for HACCP Core or Kitchen Pro.

The full source document is not required. Flowdish therefore uses selection, filtering, file-size limits, limited image counts and explicit user confirmation. A non-AI/manual workflow remains available.

## 6. Transfer mechanism and vendor commitments

The following safeguards are relied upon:

- OpenAI Services Agreement and incorporated Data Processing Addendum
- Contract with OpenAI Ireland Ltd. for EEA customers
- OpenAI contractual commitment to use SCCs or an adequacy decision for relevant onward transfers
- Public OpenAI subprocessor list and change-notification mechanism
- OpenAI commitment not to train or improve models using API customer content unless the customer expressly opts in
- Standard API abuse-monitoring retention of up to 30 days, subject to legal and safety exceptions
- OpenAI security, confidentiality, data-subject assistance, deletion and breach-notification commitments

Sources retained with this assessment:

- https://openai.com/policies/services-agreement/
- https://openai.com/policies/data-processing-addendum/
- https://openai.com/policies/sub-processor-list/
- https://developers.openai.com/api/docs/guides/your-data

## 7. Risks and controls

| Risk | Inherent risk | Controls | Residual risk |
| --- | --- | --- | --- |
| A user includes an address, name or signature | Medium | Area selection, unselected-area removal, concise warning, confirmation checkbox, manual alternative | Low to moderate |
| Unnecessary document retention | Medium | Stateless requests, `store: false`, no Flowdish raw-file persistence, documented OpenAI retention | Low |
| OpenAI onward transfer outside the EEA | Medium | OpenAI Ireland contract, DPA, SCC commitment, subprocessor transparency, data minimisation | Low to moderate |
| Provider personnel or automated safety systems access content | Medium | Low-sensitivity intended data, access/security commitments, short retention, prohibited-data rules | Low to moderate |
| Incorrect AI extraction affects stock, price or VAT records | Medium | Draft-only results, confidence indicators, totals reconciliation and mandatory human review | Low |
| Cross-restaurant disclosure | High | Tenant-scoped server queries, authenticated API routes, database access controls and no prompts shared between tenants | Low |
| API key compromise | High | Server-only environment variable, no browser exposure, provider key rotation and restricted production access | Low |
| Unannounced provider or legal change | Medium | Subprocessor notifications, annual review and event-driven reassessment | Low |

## 8. Supplementary Flowdish controls

- Keep `OPENAI_API_KEY` server-side in the production environment only.
- Use `/v1/chat/completions` or `/v1/responses` statelessly with `store: false`.
- Do not use persistent conversations, threads, assistants, vector stores or file storage for document parsing unless this assessment is updated.
- Retain the existing privacy-selection and review-before-save interfaces.
- Present the Enterprise AI notice only to Enterprise signups and enforce Enterprise-only AI access when billing-plan activation is connected to restaurant accounts.
- Keep model/provider/token/cost audit metadata without storing raw prompts or images.
- Publish and maintain the Flowdish DPA, Privacy Statement, AI Processing Notice and Subprocessor List.
- Record the customer's legal acceptance version and Enterprise AI acknowledgement.
- Maintain incident response, access revocation, deletion and data-subject request procedures.

## 9. Data-subject rights and incidents

Restaurants normally handle requests relating to their operational records as controller. Flowdish will assist the restaurant and, where necessary, use OpenAI's DPA support process. A suspected breach affecting customer content must be escalated immediately to the Flowdish privacy contact, assessed for controller notification and recorded in the incident log.

## 10. Outstanding actions

- [ ] Irish data-protection solicitor reviews the Flowdish Terms, DPA, Privacy Statement and this assessment before commercial launch.
- [ ] Final Flowdish legal entity name, registered address and company number are inserted in customer legal documents or every order form.
- [ ] Production OpenAI account is owned by the Flowdish legal entity and protected with MFA.
- [ ] Billing-plan activation enforces Enterprise-only access to AI routes before paid tiers launch.
- [ ] `OPENAI_API_KEY` is configured in Vercel Production and the former DeepSeek key is removed after successful deployment verification.
- [ ] OpenAI subprocessor-change notifications are subscribed to using the Flowdish privacy address.
- [ ] A production test confirms `store: false`, expected retention behaviour and no raw image/prompt persistence in Flowdish logs.
- [ ] The first annual review is scheduled for 2 October 2027.

## 11. Approval

| Role | Name | Decision | Date |
| --- | --- | --- | --- |
| Flowdish product owner |  |  |  |
| Privacy/legal reviewer |  |  |  |
| Technical reviewer |  |  |  |

Approval means the reviewer accepts the stated scope and controls. It does not permit special-category, payment-card, banking or child data to be sent to the AI provider.
