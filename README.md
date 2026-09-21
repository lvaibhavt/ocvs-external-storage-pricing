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
- **Units:** OCI and AWS bill per decimal GB (1 TiB = 1,099.51 GB); Azure and Google per binary GiB (1 TiB = 1,024 GiB). The tool converts.
- **Capacity billed is provisioned capacity**, not post-deduplication.
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
