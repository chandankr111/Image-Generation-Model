import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function test() {
  const users = await prisma.user.findMany(); // assuming you have a User model
  console.log(users);
}

test();
