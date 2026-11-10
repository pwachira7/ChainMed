import { ethers } from "hardhat";
import { expect } from "chai";
import assert from "node:assert/strict";
describe("ChainMedAuditRegistry", () => {
  it("anchors, enumerates, rejects duplicates and unauthorized writers", async () => {
    const [owner, other] = await ethers.getSigners();
    const c = await (
      await ethers.getContractFactory("ChainMedAuditRegistry")
    ).deploy();
    await c.waitForDeployment();
    const id = ethers.encodeBytes32String("event");
    const digest = ethers.sha256(ethers.toUtf8Bytes("canonical"));
    await assert.rejects(
      (c.connect(other) as any).anchor(id, digest),
      /writer only/,
    );
    await (await c.anchor(id, digest)).wait();
    expect((await c.get(id))[0]).eq(digest);
    expect(await c.count()).eq(1n);
    expect(await c.eventAt(0)).eq(id);
    await assert.rejects(c.anchor(id, digest), /already registered/);
    await assert.rejects(
      (c.connect(other) as any).setWriter(other.address, true),
      /owner only/,
    );
    await (await c.setWriter(other.address, true)).wait();
    await (
      await (c.connect(other) as any).anchor(
        ethers.encodeBytes32String("event2"),
        digest,
      )
    ).wait();
    expect(await c.count()).eq(2n);
    await (await c.setWriter(other.address, false)).wait();
    await assert.rejects(
      (c.connect(other) as any).anchor(
        ethers.encodeBytes32String("event3"),
        digest,
      ),
      /writer only/,
    );
  });
});
describe("Registry input and governance", () => {
  it("rejects empty commitments and zero writer addresses", async () => {
    const c = await (
      await ethers.getContractFactory("ChainMedAuditRegistry")
    ).deploy();
    await c.waitForDeployment();
    const digest = ethers.sha256(ethers.toUtf8Bytes("test"));
    await assert.rejects(c.anchor(ethers.ZeroHash, digest), /empty commitment/);
    await assert.rejects(c.anchor(digest, ethers.ZeroHash), /empty commitment/);
    await assert.rejects(c.setWriter(ethers.ZeroAddress, true), /zero writer/);
  });
  it("transfers governance only to a nonzero owner", async () => {
    const [old, next, writer] = await ethers.getSigners();
    const c = await (
      await ethers.getContractFactory("ChainMedAuditRegistry")
    ).deploy();
    await c.waitForDeployment();
    await assert.rejects(c.transferOwnership(ethers.ZeroAddress), /zero owner/);
    await (await c.transferOwnership(next.address)).wait();
    expect(await c.owner()).eq(next.address);
    await assert.rejects(c.setWriter(writer.address, true), /owner only/);
    await (
      await (c.connect(next) as any).setWriter(writer.address, true)
    ).wait();
    expect(await c.writers(writer.address)).eq(true);
  });
});
