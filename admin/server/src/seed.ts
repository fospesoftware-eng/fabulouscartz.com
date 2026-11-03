import { buildSeed } from "./seed/index.js";
import { writeDb, dbPath } from "./store.js";

const database = buildSeed();
writeDb(database);
console.log(
  JSON.stringify(
    {
      seeded: dbPath(),
      products: database.products.length,
      categories: database.categories.length,
      vendors: database.vendors.length,
      customers: database.customers.length,
      orders: database.orders.length,
      coupons: database.coupons.length,
      users: database.users.length,
      movements: database.movements.length,
    },
    null,
    2,
  ),
);
