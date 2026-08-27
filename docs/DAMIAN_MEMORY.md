# Damian conversation, history, and saved recipients

## Account boundary

Persistent Damian data is scoped to the authenticated Coretta `User.id`. An
`AiActor` is derived from that ID with a keyed, non-reversible hash. A currently
connected email address or wallet address is never used as the persistent memory
owner by itself.

## Sources of truth

- `Transfer` remains the financial source of truth.
- `SavedRecipient` stores user-confirmed labels and Arc Testnet addresses.
- `AiMemory` remains conversational preference storage.
- Saved recipients and conversation memory never authorize a payment.

Damian receives narrowly scoped API results. It does not receive unrestricted
database access or a complete transaction history.

## Independent controls

The Damian Memory settings expose independent controls for:

- personalized conversations;
- transaction-history access;
- saved-recipient lookup.

Turning off history access does not delete transfers. Turning off saved
recipients prevents conversational lookup but does not delete saved records.
Clearing conversational memory does not delete transactions or saved recipients.

## Saved-recipient rules

An address is saved only after an explicit confirmation request containing the
exact address, label, and Arc Testnet network. Labels are descriptions supplied
by the user. They do not prove real-world identity or wallet ownership.

One label can have several addresses. A single preferred address can resolve a
label, but every transfer still shows the exact destination in the locked
preview. If no unique preferred match exists, Damian asks the user to choose.

Deleting a saved recipient is a soft delete. Historical transfers remain intact.

## Transaction integration

Saved-recipient resolution feeds the existing remittance request. The existing
preview, server policy, wallet authorization, signature, Circle or bundler
execution, reconciliation, and settlement pipeline remains in control.

The selected `USDC` or `EURC` asset is included in the signed remittance intent,
stored on `Transfer`, and mapped to the canonical Arc Testnet token contract.
Both assets use six decimal places. Arc chain ID `5042002` remains mandatory for
wallet-signed requests.

## Optional server conversation model

The API can call xAI's Responses API when `XAI_API_KEY` is configured. The model
has no transaction or database tools. Wallet addresses, email addresses, phone
numbers, and bearer tokens are redacted from model context. Financial facts come
from Coretta's deterministic APIs, not model prose.

Required server-only configuration:

```env
XAI_API_KEY=<secret>
XAI_MODEL=grok-4.3
```

Do not expose `XAI_API_KEY` through a `NEXT_PUBLIC_` variable. Without the key,
Damian safely falls back to deterministic local responses.

## Encryption key compatibility

Existing encrypted Damian messages currently use the server session secret as
the fallback encryption key because a dedicated `AI_MEMORY_KEY` was not present
when they were written. Do not set a new key on an active deployment without a
planned data re-encryption and dual-key rollout, or older messages will become
unreadable.
