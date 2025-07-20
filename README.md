# `generate-member-code` Custom Coded Action

## Purpose

Better World Club issues every member a **12‑digit membership card number (`member_card_no`)** that embeds business‑specific intelligence:

* **Digits 1‑2** → Membership type (e.g., *11* = Auto Only, *12* = Auto + Bike).
* **Digits 3‑7** → Last 5 digits of the internal `member_id` (ensures traceability).
* **Digits 8‑12** → Collision‑resistant random sequence.

**HubSpot CMS Enterprise** cannot generate such derived values with native workflow actions. The `generate‑member‑code` **Custom Coded Action (CCA)** bridges that gap—assigning a unique, immutable card number immediately after a contact is created.

> **Note on Trial Usage**
> Because CCAs require an *Operations Hub Pro+* upgrade, we leveraged HubSpot’s **14‑day free Operations Hub trial** during implementation. This allowed us to build, test, and ship the workflow without incurring additional monthly cost; once the trial expired, the CCA continued to run uninterrupted.

## What It Does

1. **Runs inside a Contact‑based workflow** triggered by new contact creation (or manual enrollment during data cleanup).
2. **Checks for an existing `member_card_no`.** If present, the action exits early to preserve immutability.
3. **Pulls key inputs** (`member_id`, `membership_type`) from the contact record.
4. **Generates the 12‑digit code** using deterministic + random segments:

   ```js
   const typeCode   = getTypeCode(contact.properties.membership_type); // 2 digits
   const traceCode  = contact.properties.member_id.slice(-5);          // 5 digits
   const randCode   = Math.floor(Math.random()*100000).toString().padStart(5,'0');
   const cardNumber = `${typeCode}${traceCode}${randCode}`;            // 12 digits
   ```
5. **Guarantees uniqueness** by querying HubSpot for any contact with the same card number; if a collision occurs (unlikely, 1‑in‑100k), it retries up to 3 times.
6. **Writes `member_card_no`** back to the contact via HubSpot API and logs an outcome payload for observability.

## CCA Code Snapshot

```js
exports.main = async (event, callback) => {
  const hubspot = require('@hubspot/api-client');
  const client  = new hubspot.Client({ accessToken: process.env.memberCodeKey });

  const { objectId: contactId, properties } = event.inputFields;
  const existing = properties.member_card_no;
  if (existing) return callback({ outputFields: { member_card_no: existing }});

  const typeCode  = getTypeCode(properties.membership_type);
  const traceCode = properties.member_id.slice(-5);

  let cardNumber;
  for (let i = 0; i < 3; i++) {
    const randCode = Math.floor(Math.random()*100000).toString().padStart(5,'0');
    const candidate = `${typeCode}${traceCode}${randCode}`;
    const dup = await client.crm.contacts.basicApi.getPage(1, undefined, ["member_card_no"], undefined, `member_card_no = '${candidate}'`);
    if (dup.body.results.length === 0) { cardNumber = candidate; break; }
  }

  if (!cardNumber) throw new Error('Unique card number generation failed');

  await client.crm.contacts.basicApi.update(contactId, { properties: { member_card_no: cardNumber }});
  callback({ outputFields: { member_card_no: cardNumber }});
};

function getTypeCode(type) {
  switch (type?.toLowerCase()) {
    case 'auto only':       return '11';
    case 'auto + bike':     return '12';
    default:                return '10'; // fallback / legacy
  }
}
```

## Workflow Placement

```text
[Contact is created] ➜ [Generate Member Code (CCA)] ➜ [Send Welcome Email]
```

* The action lives between data‑sync steps (`field‑mapping`) and marketing steps.
* Re‑enrollment is *disabled* to preserve one‑time execution.

## Environment Variables / Secrets

| Name            | Purpose                                              |
| --------------- | ---------------------------------------------------- |
| `memberCodeKey` | HubSpot private‑app token (`crm.objects.contacts.*`) |

## Deployment Steps

1. **Enable Operations Hub trial** (if not already active) → *Settings → Account & Billing → Trials*.
2. **Create a new Custom Coded Action** in your workflow; paste the code above.
3. **Add secret `memberCodeKey`** referencing a private‑app token.
4. **Publish the workflow**. New contacts will receive a `member_card_no` instantly.

