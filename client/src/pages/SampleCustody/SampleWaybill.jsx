import React from "react";
import { formatSampleDate, getProjectLabel } from "../../utils/sampleMovementApi";

const SampleWaybill = ({ movement, onClose }) => {
  const totalQuantity = (movement.items || []).reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0,
  );
  const clientOwned = movement.disposition === "client_owned";

  return (
    <div className="sample-modal-backdrop elevated sample-waybill-backdrop" role="presentation" onMouseDown={(event) => { event.stopPropagation(); onClose(); }}>
      <section className="sample-waybill-shell" role="dialog" aria-modal="true" aria-labelledby="sample-waybill-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sample-waybill-toolbar">
          <div><strong>Sample waybill preview</strong><span>Print, sign, then upload the signed copy to this record.</span></div>
          <div><button type="button" className="sample-secondary-button" onClick={onClose}>Close</button><button type="button" className="sample-primary-button" onClick={() => window.print()}>Print waybill</button></div>
        </div>

        <article className="sample-waybill-print-root">
          <header className="sample-waybill-document-header">
            <div className="sample-waybill-brand">
              <img src="/mhlogo.png" alt="Magichands" />
              <div><strong>MAGICHANDS COMPANY LTD</strong><span>Hse# 6, 7th Close, Justice Brobbey Ave.</span><span>New Achimota, Accra, Ghana</span><span>0244529987 / 0302408602</span></div>
            </div>
            <div className="sample-waybill-reference">
              <span>SAMPLE WAYBILL</span>
              <strong id="sample-waybill-title">{movement.reference}</strong>
              <small>Date: {formatSampleDate(new Date())}</small>
            </div>
          </header>

          <section className="sample-waybill-parties">
            <div><span>Client</span><strong>{movement.client?.name || "—"}</strong><p>{movement.client?.address || "Address not recorded"}</p></div>
            <div><span>Contact</span><strong>{movement.client?.contactPerson || "—"}</strong><p>{[movement.client?.phone, movement.client?.email].filter(Boolean).join(" · ") || "Contact not recorded"}</p></div>
            <div><span>Project</span><strong>{getProjectLabel(movement.project || movement)}</strong><p>{movement.purpose || "—"}</p></div>
            <div><span>Handover</span><strong>{movement.handoverMethod === "pickup" ? "Client pick-up" : "Dispatch to client"}</strong><p>Expected return: {clientOwned ? "Not required" : formatSampleDate(movement.expectedReturnAt, { hour: "2-digit", minute: "2-digit" })}</p></div>
          </section>

          <table className="sample-waybill-items-table">
            <thead><tr><th>#</th><th>Sample description</th><th>Identification / condition</th><th>Qty</th><th>Unit</th></tr></thead>
            <tbody>
              {(movement.items || []).map((item, index) => (
                <tr key={item._id || index}>
                  <td>{index + 1}</td>
                  <td>{item.description}</td>
                  <td>{[item.identifyingMarks, item.outboundCondition, item.outboundConditionNotes].filter(Boolean).join(" · ") || "—"}</td>
                  <td>{item.quantity}</td>
                  <td>{item.unit}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan="3">Total tangible objects</td><td>{totalQuantity}</td><td></td></tr></tfoot>
          </table>

          <section className="sample-waybill-terms">
            <h3>Custody and liability acknowledgement</h3>
            <ol>
              <li>{clientOwned ? "Ownership of these samples transfers to the client only after Administration authorization and confirmed handover." : "These samples remain the property of Magichands Company Ltd and must be returned by the expected retrieval date shown above."}</li>
              <li>The recipient confirms the quantities and visible condition recorded on this document.</li>
              <li>Loss, damage, alteration, or missing quantities while outside our premises must be reported immediately and may attract replacement or production charges.</li>
              <li>Any payment, credit, or inclusion in the main production quantity must be documented and approved in the linked custody record.</li>
            </ol>
          </section>

          <section className="sample-waybill-signatures">
            <div><span>Released / dispatched by</span><i></i><small>Name and signature</small><i></i><small>Date and time</small></div>
            <div><span>Received by client / representative</span><i></i><small>Name and signature</small><i></i><small>Date and time</small></div>
          </section>

          <footer className="sample-waybill-footer"><span>System reference: {movement.reference}</span><span>Linked project: {movement.projectSnapshot?.orderId || movement.project?.orderId || "—"}</span></footer>
        </article>
      </section>
    </div>
  );
};

export default SampleWaybill;
