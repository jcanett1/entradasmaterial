REVOKE ALL ON FUNCTION public.return_final_exit_to_inventory(integer, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_final_exit_to_inventory(integer, text, integer) TO authenticated;
