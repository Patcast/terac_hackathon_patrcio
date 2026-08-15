## [REQUIRED] - How to set up payment

**To be eligible for the main prize (Best Overall Project & Best Overall Agent-Run Company)**, **we
need to know how much revenue your agent earned throughout the day. You need to create a personal
account on Stripe and share certain details with us so we can track how much you earn throughout the
day. Please pay close attention and follow the steps below to ensure you’re eligible for the prizes.
|**

### These steps let your team accept real payments during the hackathon and let organizers track your revenue automatically, without sharing account access with anyone else.

## 1. Create your own Stripe account

1. Go to stripe.com and click **Sign up**.
2. Use your team's email (or one team member's email, whoever creates the account should stay
   reachable in case Stripe asks for verification info).
3. You do **not** need to complete full business verification to start collecting test/small
   payments, a personal account is fine for hackathon purposes. Skip any steps that ask for business
   documents unless Stripe blocks you from continuing.

## 2. Create a Payment Link

This is the link your agent will send to "customers" to collect payment.

1. In the Stripe Dashboard, go to **Payment links** (left sidebar, or search "Payment Links" in the
   top search bar).
2. Click **+ Create payment link**.
3. Add a product, name it something recognizable, like `[Your Team Name] Payment`.
4. Set a price. If your agent charges variable amounts, choose **Customer chooses price** so you
   don't need a new link for every transaction.
5. Click **Create link**.
6. Copy the link, this is what your agent should use whenever it needs to collect a payment. **Use
   this same link for every transaction during the hackathon.**

## 3. Create a Restricted API Key (read-only)

This gives organizers a way to see your revenue without giving anyone the ability to touch your
money.

1. In the Dashboard, go to **Developers → API keys**.
2. Click **Create restricted key**.
3. Name it something like `hackathon-readonly`.
4. Under permissions, find these two resources and set each to **Read**:
   - **Balance**
   - **Charges**
5. Set every other permission to **None:** you want this key to only be able to _view_ charges and
   balance, not create, refund, or move anything.
6. Click **Create key**.
7. Copy the key (it starts with `rk_`). You will not be able to see it again after this, if you lose
   it, just create a new one.

**Important:** never generate or share your regular **secret key** (starts with `sk_`), only ever
share the restricted key described above. The restricted key cannot be used to charge cards, issue
refunds, or withdraw funds, so it's safe to submit.

## 4. Submit to organizers

Submit the following three things:

- **Team name**
- **Payment Link URL** (from Step 2)
- **Restricted API key** (from Step 3, starts with `rk_`)

## A few notes

- Only use the Payment Link you submitted, if you create a new one mid-hackathon, your revenue
  tracking will miss it. Let organizers know if you need to regenerate it.
- Do not share your Stripe login, secret key, or restricted key with anyone outside your team.
- Organizers will only ever see totals and transaction counts through the restricted key, never your
  login, never the ability to move funds.
