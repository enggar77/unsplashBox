import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
	const SIGNING_SECRET = process.env.SIGNING_SECRET;

	if (!SIGNING_SECRET) {
		throw new Error("Error: Please add SIGNING_SECRET from Clerk Dashboard to .env or .env");
	}

	// Create new Svix instance with secret
	const wh = new Webhook(SIGNING_SECRET);

	// Get headers
	const headerPayload = await headers();
	const svix_id = headerPayload.get("svix-id");
	const svix_timestamp = headerPayload.get("svix-timestamp");
	const svix_signature = headerPayload.get("svix-signature");

	// If there are no headers, error out
	if (!svix_id || !svix_timestamp || !svix_signature) {
		return new Response("Error: Missing Svix headers", {
			status: 400,
		});
	}

	// Get body
	const payload = await req.json();
	const body = JSON.stringify(payload);

	let evt: WebhookEvent;

	// Verify payload with headers
	try {
		evt = wh.verify(body, {
			"svix-id": svix_id,
			"svix-timestamp": svix_timestamp,
			"svix-signature": svix_signature,
		}) as WebhookEvent;
	} catch (err) {
		console.error("Error: Could not verify webhook:", err);
		return new Response("Error: Verification error", {
			status: 400,
		});
	}

	// Do something with payload
	const { id } = evt.data;
	const eventType = evt.type;
	console.log(`Received webhook with ID ${id} and event type of ${eventType}`);
	console.log("Webhook payload:", body);

	// Handle the webhook event
	try {
		switch (eventType) {
			case "user.created":
				await prisma.user.create({
					data: {
						id: evt.data.id,
						email: evt.data.email_addresses[0].email_address,
					},
				});
				console.log(`User ${evt.data.id} created in DB.`);
				break;
			case "user.updated":
				await prisma.user.update({
					where: { id: evt.data.id },
					data: {
						email: evt.data.email_addresses[0].email_address,
					},
				});
				console.log(`User ${evt.data.id} updated in DB.`);
				break;
			case "user.deleted":
				await prisma.user.delete({
					where: { id: evt.data.id },
				});
				console.log(`User ${evt.data.id} deleted from DB.`);
				break;
			default:
				console.log(`Unhandled webhook event type: ${eventType}`);
		}
		return NextResponse.json({ message: "Webhook received" }, { status: 200 });
	} catch (error) {
		console.error("Error handling webhook event:", error);
		return NextResponse.json({ message: "Webhook processing failed" }, { status: 500 });
	}
}
