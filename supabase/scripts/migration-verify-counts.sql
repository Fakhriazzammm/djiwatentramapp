with mirror as (
  select table_name, count(*)::int as mirror_count
  from legacy_mirror.documents
  where table_name in (
    'categories','products','inventory','inventoryStores','inventoryTransactions','recipes','baseRecipes','orders','financialTransactions','discounts','bookingSettings','bookingDateCapacity','bookingOrders','shifts','financialTargets','siteSettings','users','roles','yumiSessions'
  )
  group by table_name
)
select * from (
  select 'categories' as table_name, coalesce((select mirror_count from mirror where table_name='categories'),0) as mirror_count, (select count(*)::int from pos.categories) as target_count union all
  select 'products', coalesce((select mirror_count from mirror where table_name='products'),0), (select count(*)::int from pos.products) union all
  select 'inventory', coalesce((select mirror_count from mirror where table_name='inventory'),0), (select count(*)::int from pos.inventory) union all
  select 'inventoryStores', coalesce((select mirror_count from mirror where table_name='inventoryStores'),0), (select count(*)::int from pos.inventory_stores) union all
  select 'inventoryTransactions', coalesce((select mirror_count from mirror where table_name='inventoryTransactions'),0), (select count(*)::int from pos.inventory_transactions) union all
  select 'recipes', coalesce((select mirror_count from mirror where table_name='recipes'),0), (select count(*)::int from pos.recipes) union all
  select 'baseRecipes', coalesce((select mirror_count from mirror where table_name='baseRecipes'),0), (select count(*)::int from pos.base_recipes) union all
  select 'orders', coalesce((select mirror_count from mirror where table_name='orders'),0), (select count(*)::int from pos.orders) union all
  select 'financialTransactions', coalesce((select mirror_count from mirror where table_name='financialTransactions'),0), (select count(*)::int from pos.financial_transactions) union all
  select 'discounts', coalesce((select mirror_count from mirror where table_name='discounts'),0), (select count(*)::int from pos.discounts) union all
  select 'bookingSettings', coalesce((select mirror_count from mirror where table_name='bookingSettings'),0), (select count(*)::int from pos.booking_settings) union all
  select 'bookingDateCapacity', coalesce((select mirror_count from mirror where table_name='bookingDateCapacity'),0), (select count(*)::int from pos.booking_date_capacity) union all
  select 'bookingOrders', coalesce((select mirror_count from mirror where table_name='bookingOrders'),0), (select count(*)::int from pos.booking_orders) union all
  select 'shifts', coalesce((select mirror_count from mirror where table_name='shifts'),0), (select count(*)::int from pos.shifts) union all
  select 'financialTargets', coalesce((select mirror_count from mirror where table_name='financialTargets'),0), (select count(*)::int from pos.financial_targets) union all
  select 'siteSettings', coalesce((select mirror_count from mirror where table_name='siteSettings'),0), (select count(*)::int from pos.site_settings) union all
  select 'roles', coalesce((select mirror_count from mirror where table_name='roles'),0), (select count(*)::int from public.yumi_roles) union all
  select 'users', coalesce((select mirror_count from mirror where table_name='users'),0), (select count(*)::int from public.yumi_users) union all
  select 'yumiSessions', coalesce((select mirror_count from mirror where table_name='yumiSessions'),0), (select count(*)::int from public.yumi_sessions)
) t
order by table_name;
