# Q3 2026 revenue

*Fictional sample data from `dbt show --select fct_orders`.* Column labels, descriptions and formats come from the dbt project's documentation.

```quartile
dashboard
data: fct_orders
kpi sum(revenue)
kpi count as "Orders"
line sum(revenue) by ordered_month and channel
barlist sum(revenue) by region
```

```quartile
table sum(revenue), count by region
data: fct_orders
title: Net revenue by region
sort: -revenue
```
