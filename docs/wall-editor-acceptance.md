# Wall & Fence Editor Acceptance

Phase 1 is considered closed only when all of the following remain true on the merge commit:

- Wall/fence color is user-selectable and persisted with layout data.
- Hovering a wall/fence shows its measured length using the calibrated px/m scale.
- A selected wall/fence can be dragged as one geometry while preserving its shape.
- Selected vertices can be dragged independently to edit geometry.
- Double-clicking a selected wall/fence segment inserts a new vertex at the projected point.
- A selected vertex can be deleted with the toolbar action or `Delete`, while never reducing geometry below two vertices.
- Wall drawing snaps to existing wall/fence endpoints within a fixed screen-space tolerance.
- Holding `Shift` constrains new and moved geometry to the dominant horizontal/vertical axis.
- Consecutive zero-length points and invalid coordinates are rejected by the deterministic wall geometry helpers.
- Fence planning uses the same measured geometry model and renders with a dashed fence style.
- Existing walls remain backward compatible when `kind` and `color` are absent.
- Wall/fence kind, color, thickness, note, curved state and geometry survive JSON save/reload normalization.
- `Escape` finishes the active wall/cable draft without corrupting the current geometry.
- Production build, targeted ESLint and deterministic wall-editor tests all pass before merge.
