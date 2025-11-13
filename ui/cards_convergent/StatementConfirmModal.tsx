// ui/cards_convergent/StatementConfirmModal.tsx
// Confirmation modal for PDF-derived values

import { ConfirmationData } from '../../services/cards_convergent/types';

export interface StatementConfirmModalProps {
  cardId: string;
  data: ConfirmationData;
  onApply: (data: ConfirmationData) => void;
  onCancel: () => void;
  onKeepEstimated: () => void;
}

export function StatementConfirmModal({
  cardId,
  data,
  onApply,
  onCancel,
  onKeepEstimated
}: StatementConfirmModalProps) {
  const [editedData, setEditedData] = useState(data);
  
  const handleFieldChange = (field: keyof ConfirmationData, value: any) => {
    setEditedData(prev => ({
      ...prev,
      [field]: value
    }));
  };
  
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return '#28a745'; // Green
    if (confidence >= 0.6) return '#ffc107'; // Yellow
    return '#dc3545'; // Red
  };
  
  const getConfidenceText = (confidence: number) => {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.6) return 'Medium';
    return 'Low';
  };
  
  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000
    }}>
      <div className="modal-content" style={{
        background: 'white',
        padding: '20px',
        borderRadius: '8px',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '80vh',
        overflow: 'auto'
      }}>
        <h3>📄 Confirm Statement Data</h3>
        <p>Please review and confirm the extracted data from your statement:</p>
        
        <div style={{ margin: '20px 0' }}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
              Due Date:
            </label>
            <input
              type="date"
              value={editedData.dueDate}
              onChange={(e) => handleFieldChange('dueDate', e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
            />
            <span style={{
              fontSize: '12px',
              color: getConfidenceColor(data.fieldConfidence.dueDate),
              marginLeft: '10px'
            }}>
              {getConfidenceText(data.fieldConfidence.dueDate)} confidence (from {data.source})
            </span>
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
              Minimum Due:
            </label>
            <input
              type="number"
              step="0.01"
              value={editedData.minimumDue}
              onChange={(e) => handleFieldChange('minimumDue', parseFloat(e.target.value))}
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
            />
            <span style={{
              fontSize: '12px',
              color: getConfidenceColor(data.fieldConfidence.minimumDue),
              marginLeft: '10px'
            }}>
              {getConfidenceText(data.fieldConfidence.minimumDue)} confidence (from {data.source})
            </span>
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
              Statement Balance:
            </label>
            <input
              type="number"
              step="0.01"
              value={editedData.statementBalance}
              onChange={(e) => handleFieldChange('statementBalance', parseFloat(e.target.value))}
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
            />
            <span style={{
              fontSize: '12px',
              color: getConfidenceColor(data.fieldConfidence.statementBalance),
              marginLeft: '10px'
            }}>
              {getConfidenceText(data.fieldConfidence.statementBalance)} confidence (from {data.source})
            </span>
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
              Closing Date:
            </label>
            <input
              type="date"
              value={editedData.closingDate}
              onChange={(e) => handleFieldChange('closingDate', e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
            />
            <span style={{
              fontSize: '12px',
              color: getConfidenceColor(data.fieldConfidence.closingDate),
              marginLeft: '10px'
            }}>
              {getConfidenceText(data.fieldConfidence.closingDate)} confidence (from {data.source})
            </span>
          </div>
          
          {editedData.installments.length > 0 && (
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
                Installments:
              </label>
              <div style={{ background: '#f8f9fa', padding: '10px', borderRadius: '4px' }}>
                {editedData.installments.map((installment, index) => (
                  <div key={index} style={{ marginBottom: '5px' }}>
                    {installment.descriptor}: ${installment.amount.toFixed(2)}
                    {installment.remaining && ` (${installment.remaining} payments left)`}
                    <span style={{
                      fontSize: '12px',
                      color: getConfidenceColor(installment.confidence),
                      marginLeft: '10px'
                    }}>
                      {getConfidenceText(installment.confidence)} confidence
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              border: '1px solid #ddd',
              background: 'white',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={onKeepEstimated}
            style={{
              padding: '10px 20px',
              border: '1px solid #6c757d',
              background: '#6c757d',
              color: 'white',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Keep Estimated
          </button>
          <button
            onClick={() => onApply(editedData)}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: '#007AFF',
              color: 'white',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// React hooks compatibility
declare global {
  interface Window {
    useState: any;
  }
}

// Fallback for non-React environments
if (typeof window !== 'undefined') {
  window.StatementConfirmModal = StatementConfirmModal;
}

