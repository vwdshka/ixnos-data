namespace IxnosData.Domain.Items;

public enum ItemKind
{
    Request,          // Αίτημα (ΚΗΜΔΗΣ)
    Notice,           // Προκήρυξη, διακήρυξη, πρόσκληση (ΚΗΜΔΗΣ)
    Award,            // Ανάθεση (ΚΗΜΔΗΣ, Διαύγεια Δ.1)
    Contract,         // Σύμβαση (ΚΗΜΔΗΣ)
    Payment,          // Πληρωμή (ΚΗΜΔΗΣ, Διαύγεια Β.2.2)
    Commitment,       // Ανάληψη υποχρέωσης (Διαύγεια Β.1.3)
    SpendingApproval, // Έγκριση δαπάνης (Διαύγεια Β.2.1)
    FinalAward,       // Κατακύρωση (Διαύγεια Δ.2.2)
}
