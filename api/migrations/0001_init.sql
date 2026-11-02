-- Schema migration for bill splitter
-- Defines homes, members, bills, and shares with named integrity constraints.

CREATE TABLE homes (
  id   TEXT NOT NULL,
  name TEXT NOT NULL,
  CONSTRAINT homes_pk PRIMARY KEY (id)
);

CREATE TABLE members (
  id          TEXT    NOT NULL,
  home_id     TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  order_index INTEGER NOT NULL,
  CONSTRAINT members_pk PRIMARY KEY (id),
  CONSTRAINT members_home_fk FOREIGN KEY (home_id) REFERENCES homes (id)
);

CREATE TABLE bills (
  id          TEXT    NOT NULL,
  home_id     TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  total_cents INTEGER NOT NULL,
  CONSTRAINT bills_total_positive CHECK (total_cents > 0),
  CONSTRAINT bills_pk PRIMARY KEY (id),
  CONSTRAINT bills_home_fk FOREIGN KEY (home_id) REFERENCES homes (id)
);

CREATE TABLE shares (
  id              TEXT    NOT NULL,
  bill_id         TEXT    NOT NULL,
  member_id       TEXT    NOT NULL,
  amount_cents    INTEGER NOT NULL,
  paid_at         TEXT    DEFAULT NULL,
  idempotency_key TEXT    DEFAULT NULL,
  CONSTRAINT shares_pk PRIMARY KEY (id),
  CONSTRAINT shares_bill_fk FOREIGN KEY (bill_id) REFERENCES bills (id),
  CONSTRAINT shares_member_fk FOREIGN KEY (member_id) REFERENCES members (id),
  CONSTRAINT shares_bill_member_unique UNIQUE (bill_id, member_id)
);
