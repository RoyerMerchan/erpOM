INSERT INTO "roles" ("id", "code", "label")
VALUES (gen_random_uuid(), 'SUPERUSER', 'Superusuario');

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "roles" AS role
CROSS JOIN "permissions" AS permission
WHERE role."code" = 'SUPERUSER';
