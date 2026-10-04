# Wall & Fence Editor Acceptance

- Wall/fence color is user-selectable and persisted with layout data.
- Hovering a wall/fence shows its measured length using the calibrated px/m scale.
- A selected wall/fence can be dragged as one geometry while preserving its shape.
- Selected vertices can be dragged independently to edit geometry.
- Fence planning uses the same measured geometry model and renders with a dashed fence style.
- Existing walls remain backward compatible when `kind` and `color` are absent.
