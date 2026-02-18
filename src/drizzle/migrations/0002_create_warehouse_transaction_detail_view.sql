CREATE VIEW "warehouse_transaction_detail" AS
SELECT
  wt.id,
  wt.created_at,
  wt.updated_at,
  wt.type,
  wt.quantity,
  wt.entity_id,
  wt.entity_variant_id,
  wt.source_id,
  wt.destination_id,
  ew.name AS entity_name,
  ew.unit AS entity_unit,
  NULLIF(
    TRIM(
      COALESCE(
        NULLIF(CONCAT_WS(' x ',
          (CASE WHEN evw.entity_length IS NOT NULL AND evw.entity_length::numeric > 0 THEN TRIM(COALESCE(evw.entity_length::text, '') || ' ' || COALESCE(evw.dimension_unit, '')) ELSE NULL END),
          (CASE WHEN evw.entity_width IS NOT NULL AND evw.entity_width::numeric > 0 THEN TRIM(COALESCE(evw.entity_width::text, '') || ' ' || COALESCE(evw.dimension_unit, '')) ELSE NULL END),
          (CASE WHEN evw.entity_height IS NOT NULL AND evw.entity_height::numeric > 0 THEN TRIM(COALESCE(evw.entity_height::text, '') || ' ' || COALESCE(evw.dimension_unit, '')) ELSE NULL END)
        ), ''),
        ''
      )
      ||
      (CASE
        WHEN
          NULLIF(CONCAT_WS(' x ',
            (CASE WHEN evw.entity_length IS NOT NULL AND evw.entity_length::numeric > 0 THEN 'L' END),
            (CASE WHEN evw.entity_width IS NOT NULL AND evw.entity_width::numeric > 0 THEN 'W' END),
            (CASE WHEN evw.entity_height IS NOT NULL AND evw.entity_height::numeric > 0 THEN 'H' END)
          ), '') IS NOT NULL
          AND
          (evw.entity_thickness IS NOT NULL AND evw.entity_thickness::numeric > 0)
        THEN ' thickness '
        ELSE ''
      END)
      ||
      COALESCE(
        NULLIF(
          (CASE WHEN evw.entity_thickness IS NOT NULL AND evw.entity_thickness::numeric > 0 THEN TRIM(COALESCE(evw.entity_thickness::text, '') || ' ' || COALESCE(evw.thickness_unit, '')) ELSE NULL END),
        ''),
        ''
      )
    ),
  '') AS entity_variant,
  src.name AS source_name,
  dst.name AS destination_name
FROM warehouse_transaction wt
  LEFT JOIN entity_warehouse ew ON wt.entity_id = ew.id
  LEFT JOIN entity_variant_warehouse evw ON wt.entity_variant_id = evw.id
  LEFT JOIN destination src ON wt.source_id = src.id
  LEFT JOIN destination dst ON wt.destination_id = dst.id;
