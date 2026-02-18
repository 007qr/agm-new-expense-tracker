CREATE VIEW "transaction_detail" AS
SELECT
  t.id,
  t.created_at,
  t.updated_at,
  t.type,
  t.quantity,
  t.rate,
  t.amount,
  t.status AS payment_status,
  t.entity_id,
  t.entity_variant_id,
  t.source_id,
  t.destination_id,
  t.transportation_cost_id,
  e.name AS entity_name,
  e.unit AS entity_unit,
  NULLIF(
    TRIM(
      COALESCE(
        NULLIF(CONCAT_WS(' x ',
          (CASE WHEN ev.entity_length IS NOT NULL AND ev.entity_length::numeric > 0 THEN TRIM(COALESCE(ROUND(ev.entity_length::numeric, 2)::text, '') || ' ' || COALESCE(ev.dimension_unit, '')) ELSE NULL END),
          (CASE WHEN ev.entity_width IS NOT NULL AND ev.entity_width::numeric > 0 THEN TRIM(COALESCE(ROUND(ev.entity_width::numeric, 2)::text, '') || ' ' || COALESCE(ev.dimension_unit, '')) ELSE NULL END),
          (CASE WHEN ev.entity_height IS NOT NULL AND ev.entity_height::numeric > 0 THEN TRIM(COALESCE(ROUND(ev.entity_height::numeric, 2)::text, '') || ' ' || COALESCE(ev.dimension_unit, '')) ELSE NULL END)
        ), ''),
        ''
      )
      ||
      (CASE
        WHEN
          NULLIF(CONCAT_WS(' x ',
            (CASE WHEN ev.entity_length IS NOT NULL AND ev.entity_length::numeric > 0 THEN 'L' END),
            (CASE WHEN ev.entity_width IS NOT NULL AND ev.entity_width::numeric > 0 THEN 'W' END),
            (CASE WHEN ev.entity_height IS NOT NULL AND ev.entity_height::numeric > 0 THEN 'H' END)
          ), '') IS NOT NULL
          AND
          (ev.entity_thickness IS NOT NULL AND ev.entity_thickness::numeric > 0)
        THEN ' thickness '
        ELSE ''
      END)
      ||
      COALESCE(
        NULLIF(
          (CASE WHEN ev.entity_thickness IS NOT NULL AND ev.entity_thickness::numeric > 0 THEN TRIM(COALESCE(ROUND(ev.entity_thickness::numeric, 2)::text, '') || ' ' || COALESCE(ev.thickness_unit, '')) ELSE NULL END),
        ''),
        ''
      )
    ),
  '') AS entity_variant,
  src.name AS source_name,
  dst.name AS destination_name,
  tc.vehicle_type,
  tc.reg_no,
  tc.cost AS transportation_cost
FROM "transaction" t
  LEFT JOIN entity e ON t.entity_id = e.id
  LEFT JOIN entity_variant ev ON t.entity_variant_id = ev.id
  LEFT JOIN destination src ON t.source_id = src.id
  LEFT JOIN destination dst ON t.destination_id = dst.id
  LEFT JOIN transportation_cost tc ON t.transportation_cost_id = tc.id;
