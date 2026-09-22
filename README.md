# OCVS External Storage Pricing

Which **external datastore** options exist for VMware on each hyperscaler, what they cost at list price, and what performance you get.

**Live tool:** https://lvaibhavt.github.io/ocvs-external-storage-pricing/

Pick **Block (iSCSI/VMFS)** or **File (NFS)** and a capacity, then choose a service and tier per platform. The comparison table lays them out side by side, in the same format as the [node pricing tool](https://github.com/lvaibhavt/vmware-cloud-pricing-compare):

- **Configuration:** region, service, tier, first-party or partner
- **Protocol & media:** protocol, datastore type, media (NVMe SSD, flash, SSD), minimum and maximum size
- **Performance:** the per-TiB rate, the maximum one volume/instance can deliver, its capacity limit, the best split for your capacity, the resulting total, and what a single 100 GiB volume gets

A datastore is built from several volumes, and each volume has its own IOPS limit, so the total is **number of volumes x IOPS per volume**. Every card has a **volumes** box, because the split changes the answer:

| 100 TiB of OCI Block Volume, Balanced | Volumes | IOPS each | Total | Price |
|---|---|---|---|---|
| Fewest volumes, the default (32 TiB is the per-volume limit) | 4 x 25 TiB | 25,000 | **100,000** | $4,352/mo |
| Most volumes (32 per SDDC) | 32 x 3.13 TiB | 25,000 | **800,000** | $4,352/mo |

A volume only earns performance with size until it hits its maximum: OCI Balanced earns 60 IOPS per GB and reaches 25,000 at **417 GB**, so a 1 TiB volume and a 32 TiB volume both deliver 25,000. Elastic SAN reaches its 80,000 at 16 TiB, FSx its 200,000 at 65 TiB.

Throughput follows Oracle's binary convention: 480 KB/s per GB means a 100 GB volume gets **46 MB/s** (480 x 100 / 1024) and a 1 TiB volume gets **480 MB/s**, its maximum - the same figures the OCI cost estimator shows.

That 25,000 per volume is the "Max IOPS" figure shown in the OCI cost estimator.
- **Pricing:** rate per unit-month, per TiB, at the chosen capacity, and over 3 years, with savings against OCVS

## What's covered

| Platform | Block | File |
|---|---|---|
| **OCVS** | OCI Block Volume (iSCSI, NVMe SSD, 4 performance levels) | OCI File Storage (NFSv3) |
| **AVS** | Azure Elastic SAN · Pure Storage Cloud Dedicated* · Everpure Cloud Azure Native* | Azure NetApp Files (Standard/Premium/Ultra/Flexible) |
| **GCVE** | **none** — Google supports no block datastore | Google Cloud NetApp Volumes · Filestore (Zonal/Regional) |
| **Amazon EVS** | FSx for NetApp ONTAP (iSCSI/NVMe) | FSx for NetApp ONTAP (NFSv3/4.1) |

\* Partner products with no public price. They're listed with **price on request** and links for getting a quote.

## Assumptions

- **Region:** Frankfurt for all four platforms. List prices, no discounts or commitments, collected 21 Sep 2026.
- **Units:** 1 TiB = **1,024** capacity units, matching each provider's own calculator. OCI and AWS label the unit "GB", Azure and Google "GiB". Check: 1,024 GB OCI Block Volume at Balanced = 1,024 x $0.0425 = **$43.52/month**, the same as the OCI cost estimator.
- **Capacity billed is provisioned capacity**, not post-deduplication.
- **Hours per month:** default **730**. Azure NetApp Files, Google Cloud NetApp Volumes and Filestore are billed per unit-hour, so their monthly cost is rate x hours; set 744 for a 31-day month. OCI, Elastic SAN and FSx quote flat monthly rates, so hours don't affect them.
- **Not in the monthly figure:** FSx throughput capacity and provisioned IOPS, ANF Flexible throughput, Filestore custom performance, OCI HPMT performance units. Each is noted on the card.
- Storage only: no VMware nodes, networking, egress, backup, support or taxes. For node pricing see [vmware-cloud-pricing-compare](https://github.com/lvaibhavt/vmware-cloud-pricing-compare).

## Updating prices

All prices, performance figures and links live in [`data/storage.js`](data/storage.js). Edit the numbers and update `asOf`.

Sources: OCI price list API · Azure retail prices API · Google Cloud pricing pages · AWS Price List API, plus each provider's VMware datastore documentation (linked in the tool).

## Running locally

```bash
python3 -m http.server 8000
```

## Disclaimer

Indicative figures from public list prices, for comparison only. Not a quote. Confirm with each provider before sharing with a customer.
