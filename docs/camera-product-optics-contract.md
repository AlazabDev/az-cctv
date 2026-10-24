# Camera optical product contract (public.products)

The only canonical commercial product table is `public.products`. Its existing
`specifications jsonb` column stores manufacturer specifications. Project camera
placements must reference `products.id`, never product model text as identity.

## Canonical optical fields

```json
{
  "megapixel": 2,
  "hres": 1920,
  "vres": 1080,
  "sensor_format": "1/2.8 inch",
  "focal_mm": 2.8,
  "focal_options_mm": [2.8],
  "hfov_deg": 103,
  "vfov_deg": 55,
  "ir_range_m": 30,
  "poe_watt": 8,
  "bitrate_mbps": 4,
  "optics_source_url": "https://manufacturer.example/datasheet.pdf",
  "optics_verified": false
}
```

**The JSON above is a schema example, not technical specifications for a real product.**
Do not populate these numeric values for any SKU without its matching variant's
manufacturer datasheet or a measured calibration.

- `focal_mm` and `hfov_deg` / `vfov_deg` MUST refer to the same optical setting.
- Fixed-lens products have one focal length.
- Varifocal lenses need a manufacturer-supported focal-to-FOV lookup table before
  changing the focal setting in the designer. Merely storing
  `focal_options_mm` does NOT make other settings engineering-ready.
- Store sensor format, resolution, PoE draw and streaming bitrate as separately
  sourced specifications; do not infer them from the marketing model number.
- `optics_verified=true` is reserved for verified, SKU-specific information.
- Product revision / datasheet provenance should be retained when catalog values change.
- Product values describe capability; placement fields describe installation
  (`heightM`, `rotation`, `tilt`, `focalMm`).
- Newly placed cameras persist an `opticsSnapshot` of the chosen product
  values for design auditability. A follow-up change to the master product must
  be reconciled explicitly, not silently overwrite a previously approved design.
- The vertical FOV calculation falls back to aspect-ratio geometry only for
  older incomplete catalog records. Such estimates are not manufacturer-certified.
- PPM/DORI remain predictions based on projection geometry and do not certify
  image quality in real lighting, compression, exposure, or installation conditions.

## Acceptance before field use

1. Confirm the exact commercial SKU and optical variant.
2. Verify horizontal and vertical FOV against manufacturer data.
3. Choose actual lens setting and camera mount orientation.
4. Compute plan coverage and deployment simulation from the same optical profile.
5. Persist the selected product UUID, source and optics snapshot in the project.
6. Compare design against real commissioning photographs and measurements.
