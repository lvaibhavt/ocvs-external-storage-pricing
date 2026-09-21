# OCVS External Storage Pricing

Which **external datastore** options exist for VMware on each hyperscaler, what they cost at list price, and what performance you get.

**Live tool:** https://lvaibhavt.github.io/ocvs-external-storage-pricing/

Pick **Block (iSCSI/VMFS)** or **File (NFS)** and a capacity, and the tool shows each platform's supported options side by side, with protocol, media, performance at that capacity, monthly list cost and links to the provider's own pricing page.

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
