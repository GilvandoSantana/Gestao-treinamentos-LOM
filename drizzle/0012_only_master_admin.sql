-- O administrador passa a ser exclusivamente a conta mestra configurada no
-- Railway (MASTER_USERNAME + APP_PASSWORD), que não tem registro nesta tabela.
-- As contas promovidas a "admin" na migração 0007 voltam a ser usuários.
UPDATE `admins` SET `role` = 'user' WHERE `role` = 'admin';
