SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_id uuid NOT NULL,
    name text NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    total_price numeric(10,2) GENERATED ALWAYS AS ((unit_price * (quantity)::numeric)) STORED,
    sort_order integer,
    is_fee boolean DEFAULT false NOT NULL,
    divisible boolean DEFAULT true NOT NULL
);


--
-- Name: ledger_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ledger_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_id uuid NOT NULL,
    from_participant uuid NOT NULL,
    to_participant uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    settled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_id uuid NOT NULL,
    display_name text NOT NULL,
    user_id text,
    session_token text,
    joined_at timestamp with time zone DEFAULT now(),
    upi_id text,
    splits_submitted_at timestamp with time zone
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


--
-- Name: selections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.selections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    participant_id uuid NOT NULL,
    item_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    quantity integer DEFAULT 1 NOT NULL
);


--
-- Name: split_tables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.split_tables (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    share_code text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    status text DEFAULT 'active'::text NOT NULL,
    receipt_url text,
    raw_ocr text,
    tip numeric(10,2) DEFAULT '0'::numeric,
    currency text DEFAULT 'INR'::text NOT NULL,
    created_by text,
    payment_mode text,
    actual_paid_total numeric(10,2),
    CONSTRAINT status_check CHECK ((status = ANY (ARRAY['active'::text, 'items_ready'::text, 'editing'::text, 'settled'::text, 'expired'::text])))
);


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clerk_user_id text NOT NULL,
    display_name text,
    upi_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: items items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);


--
-- Name: ledger_entries ledger_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_pkey PRIMARY KEY (id);


--
-- Name: participants participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participants
    ADD CONSTRAINT participants_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: selections selections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.selections
    ADD CONSTRAINT selections_pkey PRIMARY KEY (id);


--
-- Name: split_tables split_tables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_tables
    ADD CONSTRAINT split_tables_pkey PRIMARY KEY (id);


--
-- Name: split_tables split_tables_share_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_tables
    ADD CONSTRAINT split_tables_share_code_unique UNIQUE (share_code);


--
-- Name: user_profiles user_profiles_clerk_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_clerk_user_id_unique UNIQUE (clerk_user_id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- Name: idx_items_table_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_table_id ON public.items USING btree (table_id);


--
-- Name: idx_ledger_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_from ON public.ledger_entries USING btree (from_participant);


--
-- Name: idx_ledger_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_table ON public.ledger_entries USING btree (table_id);


--
-- Name: idx_participants_table_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participants_table_id ON public.participants USING btree (table_id);


--
-- Name: idx_payments_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_table ON public.payments USING btree (table_id);


--
-- Name: idx_selections_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_selections_item ON public.selections USING btree (item_id);


--
-- Name: idx_selections_participant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_selections_participant ON public.selections USING btree (participant_id);


--
-- Name: idx_split_tables_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_split_tables_created_by ON public.split_tables USING btree (created_by);


--
-- Name: idx_split_tables_share_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_split_tables_share_code ON public.split_tables USING btree (share_code);


--
-- Name: participants_table_user_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX participants_table_user_unique ON public.participants USING btree (table_id, user_id) WHERE (user_id IS NOT NULL);


--
-- Name: payments_table_participant_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payments_table_participant_unique ON public.payments USING btree (table_id, participant_id);


--
-- Name: selections_participant_item_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX selections_participant_item_unique ON public.selections USING btree (participant_id, item_id);


--
-- Name: items items_table_id_split_tables_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_table_id_split_tables_id_fk FOREIGN KEY (table_id) REFERENCES public.split_tables(id) ON DELETE CASCADE;


--
-- Name: ledger_entries ledger_entries_from_participant_participants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_from_participant_participants_id_fk FOREIGN KEY (from_participant) REFERENCES public.participants(id);


--
-- Name: ledger_entries ledger_entries_table_id_split_tables_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_table_id_split_tables_id_fk FOREIGN KEY (table_id) REFERENCES public.split_tables(id);


--
-- Name: ledger_entries ledger_entries_to_participant_participants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_to_participant_participants_id_fk FOREIGN KEY (to_participant) REFERENCES public.participants(id);


--
-- Name: participants participants_table_id_split_tables_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participants
    ADD CONSTRAINT participants_table_id_split_tables_id_fk FOREIGN KEY (table_id) REFERENCES public.split_tables(id) ON DELETE CASCADE;


--
-- Name: payments payments_participant_id_participants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_participant_id_participants_id_fk FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE CASCADE;


--
-- Name: payments payments_table_id_split_tables_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_table_id_split_tables_id_fk FOREIGN KEY (table_id) REFERENCES public.split_tables(id) ON DELETE CASCADE;


--
-- Name: selections selections_item_id_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.selections
    ADD CONSTRAINT selections_item_id_items_id_fk FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: selections selections_participant_id_participants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.selections
    ADD CONSTRAINT selections_participant_id_participants_id_fk FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('20260426000000'),
    ('20260502000000'),
    ('20260623000000'),
    ('20260627000000'),
    ('20260627000001'),
    ('20260627000002'),
    ('20260704000000'),
    ('20260705000000'),
    ('20260705000001'),
    ('20260818000000');
