{% docs fct_orders %}
Orders with net revenue after discounts and returns. One row per order.

Revenue by region, from the snapshot written by `export-show.mjs`:

```quartile
barlist sum(revenue) by region
title: Net revenue by region
src: quartile/fct_orders.json
```
{% enddocs %}
