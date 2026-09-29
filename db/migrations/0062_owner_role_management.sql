grant insert, delete on beauty.user_roles to beauty_admin_ops;

alter function beauty.owner_set_privileged_role(uuid,text,boolean,text)
  owner to postgres;

alter function beauty.owner_set_staff_permissions(uuid,text[],text)
  owner to postgres;
