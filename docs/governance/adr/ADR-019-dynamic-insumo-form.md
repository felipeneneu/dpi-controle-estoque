# ADR-019: Dynamic Insumo Forms and Data Modeling Adjustments

## Status
Accepted

## Context
The stock management module (`/produtos`) currently requires users to manually input a `codigo` for items and presents static fields that are not always relevant (e.g., asking for `largura` when the unit is `fls` or the category is `Tinta`). Furthermore, assigning multiple machines to a new insumo requires an additional step after creation, and there is no UI affordance to delete incorrectly created or obsolete products.

We need a UX overhaul to streamline product creation/editing, prevent invalid data entry (e.g., width on ink), and improve the overall workflow.

## Decision
1. **Dynamic Form Fields**:
   - The UI will automatically hide the `largura` field if the selected unit is `fls` or the category is `INK_SUPPLY`.
   - Labels and default unit options will automatically adapt when switching categories (e.g., defaulting to `ml` or `L` for inks).

2. **Auto-Generated Identifiers**:
   - The manual `código` input field will be removed from the frontend creation form.
   - The system will allow the backend or frontend to auto-generate a unique ID transparently, removing cognitive load from the user.

3. **Multi-Machine Association on Creation**:
   - The backend schema for `POST /api/stock-items` will be updated to accept a `machineIds` array instead of a single `machineId`.
   - The UI will present a multi-select or checkbox list during creation to link the product to multiple machines instantly.

4. **Product Deletion Capability**:
   - The `DELETE /api/stock-items/:id` endpoint will be updated to allow `ADMIN` access (in addition to `DEV_MASTER`).
   - A restricted "Excluir Insumo" button will be added to the edit modal, complete with a confirmation dialogue.

## Rationale
- **Preventing User Error**: Hiding irrelevant fields ensures that impossible configurations (e.g., a bottle of ink with a width in meters) cannot be submitted.
- **Workflow Efficiency**: Consolidating machine assignments into the creation step and removing the need to invent a unique `codigo` significantly speeds up the registration of new items.
- **Catalog Maintenance**: Providing a deletion capability allows administrators to keep the stock catalog clean and accurate, reducing clutter over time.

## Trade-offs
- Removing manual control over the `codigo` means users cannot enforce a legacy nomenclature scheme if they desired to. However, this is acceptable as the system primarily tracks items by internal ID and prints its own labels.
- Modifying the backend payload for machine assignments breaks compatibility with any older scripts hitting `POST /api/stock-items` that expect `machineId`. Given this is an internal tool, we control all clients and can update them synchronously.

## Consequences
- **Positive**: Much cleaner UI, faster registration process, reduced likelihood of bad data, and a way to clean up the database.
- **Negative**: Slight increase in frontend component complexity due to dynamic field rendering.
- **Mitigation**: We will encapsulate the dynamic logic in small, well-tested components or form hooks to keep the component code maintainable.
