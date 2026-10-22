# Djiwa Checkout Standard Rollout — Definition of Done

- [ ] Public/customer checkout apps are registered in one checkout standard manifest.
- [ ] Existing customer, B2B, merchandise, Order Mie Yamin, and Djiwa Pay apps depend on `@yumipos/djiwa-checkout-ui`.
- [ ] Existing checkout surfaces load shared checkout styles and shared page shell.
- [ ] A repository guard fails when a new checkout surface is created without the shared package contract.
- [ ] The guard distinguishes customer checkout from operator POS/admin payment operations.
- [ ] All changed app/package manifests and guard script pass syntax/type/build verification.
- [ ] Production deployment is not performed until the rollout build and guard pass.
- [ ] Preview evidence includes guard output and built bundle markers.
